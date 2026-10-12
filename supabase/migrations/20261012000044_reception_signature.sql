-- RECEPCIÓN CON FIRMA: el acta de recepción debe estar firmada por el cliente antes del diagnóstico; el SUPERADMIN puede autorizar una excepción
-- (auditada); la firma puede capturarse de forma presencial en el dispositivo del personal (canal registrado, nunca «en nombre» del cliente);
-- avisos del acta; y el SUPERADMIN recibe una copia de supervisión de TODOS los avisos de tickets (no queda «ciego» ante lo del técnico/cliente).
-- Aditiva: columnas nuevas con valores por defecto, una tabla nueva y funciones reemplazadas por su versión anterior + el cambio mínimo.

-- ---------------------------------------------------------------- firma: canal de captura
alter table public.document_signatures
  add column if not exists capture_channel text not null default 'client_session' check (capture_channel in ('client_session', 'assisted')),
  add column if not exists captured_by uuid references public.profiles (id) on delete restrict;
alter table public.document_signatures alter column signer_profile_id drop not null;
alter table public.document_signatures add constraint document_signatures_signer_chk check (signer_profile_id is not null or capture_channel = 'assisted');
alter table public.document_signatures add constraint document_signatures_assisted_chk check (capture_channel <> 'assisted' or captured_by is not null);

-- ---------------------------------------------------------------- excepciones autorizadas (inmutables)
create table public.ticket_exceptions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete restrict,
  kind text not null check (kind in ('reception_signature')),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  authorized_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (ticket_id, kind)
);
create trigger ticket_exceptions_immutable before update or delete on public.ticket_exceptions for each row execute function private.forbid_mutation();
alter table public.ticket_exceptions enable row level security;
create policy ticket_exceptions_read on public.ticket_exceptions for select to authenticated
  using ((select private.is_staff()) and (select private.can_view_ticket(ticket_id)));
revoke all on public.ticket_exceptions from anon, authenticated;
grant select on public.ticket_exceptions to authenticated;
grant all on public.ticket_exceptions to service_role;

create function private.reception_signed(p_ticket uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select d.status = 'signed' from public.documents d where d.ticket_id = p_ticket and d.doc_type = 'reception' order by d.version desc limit 1), false)
$$;

-- ---------------------------------------------------------------- transición con el requisito de firma
create or replace function private.apply_transition(
  p_ticket uuid, p_to public.ticket_status, p_actor uuid, p_actor_role text, p_reason text, p_system boolean default false
) returns public.ticket_status
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype; tr public.ticket_transitions%rowtype; v_min int; v_n int; v_reason text := nullif(btrim(p_reason), '');
  v_q public.quotes%rowtype; m record;
begin
  select * into t from public.tickets where id = p_ticket and deleted_at is null for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into tr from public.ticket_transitions where from_status = t.status and to_status = p_to;
  if not found then raise exception 'invalid_transition: % -> %', t.status, p_to using errcode = 'P0001'; end if;
  if not p_system and not (p_actor_role::public.app_role = any (tr.allowed_roles)) then
    raise exception 'forbidden_transition' using errcode = '42501';
  end if;
  if tr.requires_reason and v_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;

  if p_to = 'diagnosing' and t.status = 'received' then
    if not exists (select 1 from public.receptions where ticket_id = t.id) then
      raise exception 'precondition_failed: reception_missing' using errcode = 'P0001';
    end if;
    select coalesce((select (value #>> '{}')::int from public.app_settings where key = 'reception.min_photos'), 0) into v_min;
    select count(*) into v_n from public.evidence where ticket_id = t.id and stage = 'reception' and deleted_at is null;
    if v_n < v_min then raise exception 'precondition_failed: reception_photos_missing' using errcode = 'P0001'; end if;
    -- El acta de recepción debe estar FIRMADA por el cliente (o existir una excepción autorizada y auditada por el SUPERADMIN).
    if not private.reception_signed(t.id) and not exists (select 1 from public.ticket_exceptions x where x.ticket_id = t.id and x.kind = 'reception_signature') then
      raise exception 'precondition_failed: reception_signature_missing' using errcode = 'P0001';
    end if;
  elsif p_to = 'awaiting_approval' then
    if not exists (select 1 from public.quotes where ticket_id = t.id and status = 'sent') then
      raise exception 'precondition_failed: quote_not_sent' using errcode = 'P0001';
    end if;
  elsif p_to in ('in_service', 'awaiting_part') and t.status in ('awaiting_approval', 'awaiting_part', 'diagnosing') then
    if not exists (select 1 from public.quotes where ticket_id = t.id and status = 'approved')
       and not (t.status = 'diagnosing' and p_to = 'in_service'
                and exists (select 1 from public.services s where s.id = t.service_id and not s.requires_quote)) then
      raise exception 'precondition_failed: quote_not_approved' using errcode = 'P0001';
    end if;
    -- Desde la aprobación, el servicio solo empieza con un pago CONFIRMADO de la cotización (anticipo o total), salvo que no haya nada que cobrar.
    if t.status = 'awaiting_approval' then
      select * into v_q from public.quotes where ticket_id = t.id and status = 'approved' order by version desc limit 1;
      select * into m from private.quote_money(v_q.id);
      if m.base > 0 and m.approved_count = 0 then raise exception 'precondition_failed: quote_payment_pending' using errcode = 'P0001'; end if;
    end if;
  elsif p_to = 'ready' then
    if not exists (select 1 from public.checklist_runs where ticket_id = t.id) then
      raise exception 'precondition_failed: checklist_missing' using errcode = 'P0001';
    end if;
    if exists (
         select 1 from public.checklist_items ci
         where ci.run_id = (select id from public.checklist_runs where ticket_id = t.id order by created_at desc limit 1)
           and ci.is_required and ci.state in ('pending', 'fail')) then
      raise exception 'precondition_failed: checklist_incomplete' using errcode = 'P0001';
    end if;
  elsif p_to = 'delivered' then
    if not exists (select 1 from public.deliveries where ticket_id = t.id) then
      raise exception 'precondition_failed: delivery_record_missing' using errcode = 'P0001';
    end if;
    -- No se entrega con saldo pendiente de una cotización aprobada.
    select * into v_q from public.quotes where ticket_id = t.id and status = 'approved' order by version desc limit 1;
    if found then
      select * into m from private.quote_money(v_q.id);
      if m.balance > 0 then raise exception 'precondition_failed: balance_pending' using errcode = 'P0001'; end if;
    end if;
  end if;

  update public.tickets set
    status = p_to,
    delivered_at = case when p_to = 'delivered' then now() else delivered_at end,
    cancelled_reason = case when p_to = 'cancelled' then left(v_reason, 500) else cancelled_reason end
  where id = t.id;
  insert into public.ticket_status_history (ticket_id, from_status, to_status, actor_id, actor_role, reason)
  values (t.id, t.status, p_to, p_actor, p_actor_role, left(v_reason, 500));
  perform private.write_audit(p_actor, p_actor_role, 'ticket.status_changed', 'tickets', t.id::text,
    jsonb_build_object('from', t.status, 'to', p_to, 'system', p_system));
  perform private.notify_ticket_transition(t, p_to, p_actor);
  if p_to = 'delivered' then perform private.on_delivered(t, p_actor); end if;
  return p_to;
end $$;

-- ---------------------------------------------------------------- avisos: copia de supervisión para el SUPERADMIN
-- Cada aviso a un cliente o técnico deja una copia (tipo `supervision`, prioridad baja: sin correo ni push) para cada SUPERADMIN, con el contexto
-- (para quién, servicio y cliente). Si el SUPERADMIN ya tiene su aviso propio de ese evento, no se duplica; si llega después, lo reemplaza.
create or replace function private.notify(
  p_event text, p_recipient uuid, p_type text, p_title text, p_body text, p_entity_type text, p_entity_id uuid,
  p_priority text default 'normal', p_actor uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role text; v_ticket uuid; v_ctx text; v_for text; s record;
begin
  if p_recipient is null or p_recipient is not distinct from p_actor then return; end if;
  select role::text into v_role from public.profiles where id = p_recipient and is_active and deleted_at is null;
  if v_role is null then return; end if;
  if v_role = 'superadmin' and p_type <> 'supervision' then
    -- el aviso propio reemplaza a la copia de supervisión del mismo evento (conserva si ya la leyó)
    update public.notifications set type = p_type, title = left(p_title, 160), body = left(p_body, 500), priority = p_priority, event_key = p_event
     where recipient_id = p_recipient and event_key = 'sup:' || p_event;
    if found then return; end if;
  end if;
  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id, event_key, priority)
  values (p_recipient, p_type, left(p_title, 160), left(p_body, 500), p_entity_type, p_entity_id, p_event, p_priority)
  on conflict (recipient_id, event_key) where event_key is not null do nothing;
  if v_role = 'superadmin' or p_entity_id is null or p_event like 'sup:%' then return; end if;
  v_ticket := case p_entity_type
    when 'ticket' then p_entity_id
    when 'document' then (select ticket_id from public.documents where id = p_entity_id)
    when 'payment' then (select ticket_id from public.payments where id = p_entity_id)
    else null end;
  select 'Servicio ' || t.code || ' · ' || coalesce(c.full_name, 'cliente') into v_ctx
    from public.tickets t left join public.customers c on c.id = t.customer_id where t.id = v_ticket;
  v_for := case v_role when 'client' then 'cliente' when 'technician' then 'técnico' else v_role end;
  for s in select id from public.profiles where role = 'superadmin' and is_active and deleted_at is null and id is distinct from p_actor loop
    if exists (select 1 from public.notifications where recipient_id = s.id and event_key = p_event) then continue; end if;
    insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id, event_key, priority)
    values (s.id, 'supervision', left(p_title, 160), left('Para ' || v_for || coalesce(' · ' || v_ctx, '') || coalesce('. ' || p_body, ''), 500),
            case when v_ticket is not null then 'ticket' else p_entity_type end, coalesce(v_ticket, p_entity_id), 'sup:' || p_event, 'low')
    on conflict (recipient_id, event_key) where event_key is not null do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------- avisos del acta de recepción y de otros documentos
create function private.on_document_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_cust uuid;
begin
  if new.doc_type = 'reception' then
    select profile_id into v_cust from public.customers where id = new.customer_id;
    perform private.notify('doc-pending:' || new.id, v_cust, 'document.sign_pending', 'Firma el acta de recepción',
      'Revisa y firma el acta de tu equipo para que podamos iniciar el diagnóstico.', 'document', new.id, 'high', null);
  end if;
  return null;
end $$;
create trigger documents_notify_created after insert on public.documents for each row execute function private.on_document_created();

create function private.on_document_signed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype; v_cust uuid; v_name text;
begin
  if new.ticket_id is null or new.doc_type not in ('reception', 'delivery') then return null; end if;
  select * into t from public.tickets where id = new.ticket_id;
  if not found then return null; end if;
  select profile_id into v_cust from public.customers where id = new.customer_id;
  v_name := case new.doc_type when 'reception' then 'acta de recepción' else 'acta de entrega' end;
  perform private.notify('doc-signed:' || new.id, v_cust, 'document.signed', 'Documento firmado', 'Guardamos tu firma en el ' || v_name || '. Puedes consultarlo cuando quieras.', 'document', new.id, 'normal', null);
  perform private.notify('doc-signed:' || new.id, t.assigned_to, 'document.signed_staff', 'Firmada: ' || v_name || ' ' || t.code,
    case new.doc_type when 'reception' then 'El cliente firmó el acta. Ya puedes diagnosticar el equipo.' else 'El cliente firmó el acta de entrega.' end, 'ticket', t.id, 'high', null);
  -- Con el acta firmada (y fotos + acta de recepción completos) el ticket pasa solo a diagnóstico: transición del sistema con sus precondiciones.
  if new.doc_type = 'reception' and t.status = 'received' then
    begin
      perform private.apply_transition(t.id, 'diagnosing', null, 'system', 'Acta de recepción firmada por el cliente', true);
    exception when others then
      -- una precondición pendiente (p. ej. fotos) no debe impedir registrar la firma: el técnico verá qué falta
      null;
    end;
  end if;
  return null;
end $$;
create trigger documents_notify_signed after update of status on public.documents for each row
  when (new.status = 'signed' and old.status is distinct from 'signed') execute function private.on_document_signed();

/** Aviso «documento disponible» (idempotente, con copia de supervisión). Lo usa el generador de PDF en lugar de insertar a mano. */
create function public.notify_document_available(p_doc uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.documents%rowtype; v_cust uuid;
begin
  select * into d from public.documents where id = p_doc;
  if not found or d.doc_type = 'reception' then return; end if; -- el acta de recepción tiene su propio aviso (firma pendiente)
  select profile_id into v_cust from public.customers where id = d.customer_id;
  perform private.notify('doc:' || d.id, v_cust, 'document.available', 'Nuevo documento: ' || d.title, null, 'document', d.id, 'normal', null);
end $$;
revoke execute on function public.notify_document_available(uuid) from public, anon, authenticated;
grant execute on function public.notify_document_available(uuid) to service_role;

-- ---------------------------------------------------------------- excepción autorizada (solo SUPERADMIN, auditada)
create function public.authorize_reception_exception(p_actor uuid, p_ticket uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype; v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'superadmin' and is_active and deleted_at is null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(v_reason) < 5 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into t from public.tickets where id = p_ticket and deleted_at is null for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  if t.status <> 'received' then raise exception 'ticket_not_waiting_reception' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.receptions where ticket_id = t.id) then raise exception 'reception_missing' using errcode = 'P0001'; end if;
  if private.reception_signed(t.id) then raise exception 'already_signed' using errcode = 'P0001'; end if;
  insert into public.ticket_exceptions (ticket_id, kind, reason, authorized_by) values (t.id, 'reception_signature', left(v_reason, 500), p_actor);
  perform private.write_audit(p_actor, 'superadmin', 'ticket.exception_authorized', 'tickets', t.id::text, jsonb_build_object('kind', 'reception_signature', 'reason', left(v_reason, 200)));
  perform private.notify('exc:' || t.id, t.assigned_to, 'ticket.exception', 'Excepción autorizada: ' || t.code, 'Administración autorizó continuar sin la firma del acta de recepción.', 'ticket', t.id, 'high', p_actor);
  perform private.notify_superadmins('exc:' || t.id, 'ticket.exception', 'Excepción autorizada: ' || t.code, 'Se continuó sin la firma del acta: ' || left(v_reason, 200), 'ticket', t.id, 'high', p_actor);
  perform private.apply_transition(t.id, 'diagnosing', p_actor, 'superadmin', 'Excepción autorizada: ' || left(v_reason, 200), true);
end $$;
revoke execute on function public.authorize_reception_exception(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.authorize_reception_exception(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------- permisos de las funciones internas nuevas
revoke execute on function private.reception_signed(uuid), private.on_document_created(), private.on_document_signed() from public, anon, authenticated;
