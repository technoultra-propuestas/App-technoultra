-- FASE 6 · 11 · Flujo de cotizaciones: envío, decisión del cliente, preguntas, aprobación presencial y revisión.
-- Todas las funciones validan la identidad con auth.uid() y registran eventos inmutables + auditoría.

create function private.quote_event(p_quote uuid, p_type text, p_role text, p_message text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.quote_events (quote_id, event_type, actor_id, actor_role, message)
  values (p_quote, p_type, auth.uid(), p_role, left(p_message, 1000))
$$;

create function private.notify_ticket_staff(p_ticket uuid, p_type text, p_title text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (recipient_id, type, title, entity_type, entity_id)
  select t.assigned_to, p_type, p_title, 'ticket', t.id from public.tickets t where t.id = p_ticket and t.assigned_to is not null
$$;

-- El personal envía la cotización: debe tener ítems, y el ticket pasa a "Esperando aprobación".
create function public.send_quote(p_quote uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; v_days int; v_role public.app_role := private.my_role();
begin
  if v_role is null or v_role = 'client' or not private.can_manage_quote(p_quote) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if q.status <> 'draft' then raise exception 'quote_not_draft' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.quote_items where quote_id = q.id) then raise exception 'quote_empty' using errcode = 'P0001'; end if;
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = 'quote.default_validity_days'), 15) into v_days;
  update public.quotes set status = 'sent', sent_at = now(), valid_until = coalesce(valid_until, (now() at time zone 'America/Bogota')::date + v_days) where id = q.id;
  perform private.quote_event(q.id, 'sent', v_role::text);
  perform private.write_audit(auth.uid(), v_role::text, 'quote.sent', 'quotes', q.id::text, jsonb_build_object('total', q.total));
  if q.ticket_id is not null then
    perform private.apply_transition(q.ticket_id, 'awaiting_approval', auth.uid(), v_role::text, null, false);
  end if;
  insert into public.notifications (recipient_id, type, title, entity_type, entity_id)
  select c.profile_id, 'quote.sent', 'Tienes una cotización por revisar: ' || q.code, 'quote', q.id
  from public.customers c where c.id = q.customer_id and c.profile_id is not null;
end $$;

-- Decisión del CLIENTE sobre su cotización. p_decision: approve | reject | question.
create function public.decide_quote(p_quote uuid, p_decision text, p_message text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; v_msg text := nullif(btrim(p_message), '');
begin
  if auth.uid() is null or private.my_role() is distinct from 'client' then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote and customer_id = private.my_customer_id() for update;
  if not found then raise exception 'quote_not_found' using errcode = 'P0002'; end if;
  if q.status not in ('sent', 'clarification') then raise exception 'quote_not_open' using errcode = 'P0001'; end if;
  if q.valid_until is not null and q.valid_until < (now() at time zone 'America/Bogota')::date then
    raise exception 'quote_expired' using errcode = 'P0001';
  end if;

  if p_decision = 'approve' then
    update public.quotes set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = q.id;
    perform private.quote_event(q.id, 'approved', 'client', v_msg);
    perform private.write_audit(auth.uid(), 'client', 'quote.approved', 'quotes', q.id::text, jsonb_build_object('total', q.total));
    if q.ticket_id is not null then
      perform private.apply_transition(q.ticket_id, case when q.needs_part then 'awaiting_part' else 'in_service' end::public.ticket_status,
        auth.uid(), 'client', 'Cotización aprobada por el cliente', true);
      perform private.notify_ticket_staff(q.ticket_id, 'quote.approved', 'El cliente aprobó la cotización ' || q.code);
    end if;
  elsif p_decision = 'reject' then
    update public.quotes set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = q.id;
    perform private.quote_event(q.id, 'rejected', 'client', v_msg);
    perform private.write_audit(auth.uid(), 'client', 'quote.rejected', 'quotes', q.id::text, '{}'::jsonb);
    if q.ticket_id is not null then
      perform private.apply_transition(q.ticket_id, 'cancelled', auth.uid(), 'client',
        'Cotización rechazada por el cliente' || coalesce(': ' || v_msg, ''), true);
      perform private.notify_ticket_staff(q.ticket_id, 'quote.rejected', 'El cliente rechazó la cotización ' || q.code);
    end if;
  elsif p_decision = 'question' then
    if v_msg is null then raise exception 'message_required' using errcode = '22023'; end if;
    update public.quotes set status = 'clarification' where id = q.id;
    perform private.quote_event(q.id, 'question', 'client', v_msg);
    if q.ticket_id is not null then perform private.notify_ticket_staff(q.ticket_id, 'quote.question', 'El cliente tiene una pregunta sobre ' || q.code); end if;
  else
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
end $$;

-- El personal responde la pregunta; la cotización vuelve a "enviada".
create function public.answer_quote_question(p_quote uuid, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; v_role public.app_role := private.my_role();
begin
  if v_role is null or v_role = 'client' or not private.can_manage_quote(p_quote) then raise exception 'forbidden' using errcode = '42501'; end if;
  if nullif(btrim(p_message), '') is null then raise exception 'message_required' using errcode = '22023'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if q.status <> 'clarification' then raise exception 'quote_not_open' using errcode = 'P0001'; end if;
  update public.quotes set status = 'sent' where id = q.id;
  perform private.quote_event(q.id, 'answered', v_role::text, p_message);
  insert into public.notifications (recipient_id, type, title, entity_type, entity_id)
  select c.profile_id, 'quote.answered', 'Respondimos tu pregunta sobre ' || q.code, 'quote', q.id
  from public.customers c where c.id = q.customer_id and c.profile_id is not null;
end $$;

-- Aprobación presencial (el cliente aprueba en el local): la registra el personal y queda en auditoría.
create function public.record_in_person_approval(p_quote uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; v_role public.app_role := private.my_role();
begin
  if v_role is null or v_role = 'client' or not private.can_manage_quote(p_quote) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if q.status not in ('sent', 'clarification') then raise exception 'quote_not_open' using errcode = 'P0001'; end if;
  update public.quotes set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = q.id;
  perform private.quote_event(q.id, 'approved', v_role::text, 'Aprobación presencial registrada por el personal');
  perform private.write_audit(auth.uid(), v_role::text, 'quote.approved_in_person', 'quotes', q.id::text, jsonb_build_object('total', q.total));
  if q.ticket_id is not null then
    perform private.apply_transition(q.ticket_id, case when q.needs_part then 'awaiting_part' else 'in_service' end::public.ticket_status,
      auth.uid(), v_role::text, 'Aprobación presencial', false);
  end if;
end $$;

-- Nueva versión: la cotización vigente queda "reemplazada" y se crea un borrador con los mismos ítems.
create function public.revise_quote(p_quote uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; v_new uuid; v_role public.app_role := private.my_role(); v_ticket_status public.ticket_status;
begin
  if v_role is null or v_role = 'client' or not private.can_manage_quote(p_quote) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if q.status not in ('sent', 'clarification') then raise exception 'quote_not_revisable' using errcode = 'P0001'; end if;
  update public.quotes set status = 'superseded' where id = q.id;
  insert into public.quotes (ticket_id, project_id, customer_id, version, supersedes_id, notes, terms, needs_part, created_by)
  values (q.ticket_id, q.project_id, q.customer_id, q.version + 1, q.id, q.notes, q.terms, q.needs_part, auth.uid())
  returning id into v_new;
  insert into public.quote_items (quote_id, position, kind, service_id, product_id, description, qty, unit_price, discount, tax_rate, warranty_days, warranty_kind)
  select v_new, position, kind, service_id, product_id, description, qty, unit_price, discount, tax_rate, warranty_days, warranty_kind
  from public.quote_items where quote_id = q.id;
  perform private.quote_event(q.id, 'revised', v_role::text, 'Se creó la versión ' || (q.version + 1));
  perform private.write_audit(auth.uid(), v_role::text, 'quote.revised', 'quotes', v_new::text, jsonb_build_object('from', q.id));
  if q.ticket_id is not null then
    select status into v_ticket_status from public.tickets where id = q.ticket_id;
    if v_ticket_status = 'awaiting_approval' then
      perform private.apply_transition(q.ticket_id, 'diagnosing', auth.uid(), v_role::text, 'Cotización en revisión', false);
    end if;
  end if;
  return v_new;
end $$;

revoke execute on function public.send_quote(uuid), public.decide_quote(uuid, text, text), public.answer_quote_question(uuid, text),
  public.record_in_person_approval(uuid), public.revise_quote(uuid) from public, anon;
grant execute on function public.send_quote(uuid), public.decide_quote(uuid, text, text), public.answer_quote_question(uuid, text),
  public.record_in_person_approval(uuid), public.revise_quote(uuid) to authenticated, service_role;
