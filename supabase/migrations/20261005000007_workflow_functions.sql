-- FASE 1 · 07 · Autorización por recurso y flujo de negocio (máquina de estados, asignación, legal, seguimiento).
-- Toda función SECURITY DEFINER fija search_path vacío, valida identidad con auth.uid() y revoca EXECUTE a PUBLIC (migración 09).

-- ---------------------------------------------------------------- autorización por recurso (defensa contra IDOR)
create function private.can_view_ticket(p_ticket uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tickets t
    where t.id = p_ticket and t.deleted_at is null and (
      private.is_admin()
      or (private.is_technician() and t.assigned_to = auth.uid())
      or t.customer_id = private.my_customer_id()))
$$;
create function private.can_manage_ticket(p_ticket uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tickets t
    where t.id = p_ticket and t.deleted_at is null and (
      private.is_admin() or (private.is_technician() and t.assigned_to = auth.uid())))
$$;
create function private.can_view_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin()
    or p_customer = private.my_customer_id()
    or (private.is_technician() and exists (
          select 1 from public.tickets t where t.customer_id = p_customer and t.assigned_to = auth.uid() and t.deleted_at is null))
$$;
create function private.can_view_quote(p_quote uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.quotes q where q.id = p_quote and (
      private.is_admin()
      or (q.ticket_id is not null and private.can_view_ticket(q.ticket_id) and (private.is_staff() or q.status <> 'draft'))
      or (q.customer_id = private.my_customer_id() and q.status <> 'draft')))
$$;
create function private.can_manage_quote(p_quote uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.quotes q where q.id = p_quote and (
      private.is_admin() or (q.ticket_id is not null and private.can_manage_ticket(q.ticket_id))))
$$;
create function private.can_view_document(p_doc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d where d.id = p_doc and (
      private.is_admin()
      or (d.ticket_id is not null and private.is_technician() and private.can_view_ticket(d.ticket_id))
      or (d.customer_id = private.my_customer_id() and d.status <> 'draft')))
$$;

-- ---------------------------------------------------------------- máquina de estados
create function private.status_label(p_status public.ticket_status) returns text
language sql immutable set search_path = '' as $$
  select case p_status
    when 'received' then 'Recibido' when 'diagnosing' then 'En diagnóstico' when 'awaiting_approval' then 'Esperando aprobación'
    when 'awaiting_part' then 'Esperando repuesto' when 'in_service' then 'En servicio' when 'testing' then 'En pruebas'
    when 'ready' then 'Listo para entregar' when 'delivered' then 'Entregado' when 'cancelled' then 'Cancelado' end
$$;

-- Acciones posteriores a la entrega: garantías, próximo mantenimiento, tarea CRM, agenda.
create function private.on_delivered(t public.tickets, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_months int; v_due timestamptz; v_task uuid; v_today date := (now() at time zone 'America/Bogota')::date;
begin
  insert into public.warranties (kind, customer_id, ticket_id, equipment_id, quote_item_id, description, start_date, end_date)
  select qi.warranty_kind, t.customer_id, t.id, t.equipment_id, qi.id, qi.description, v_today, v_today + qi.warranty_days
  from public.quote_items qi join public.quotes q on q.id = qi.quote_id
  where q.ticket_id = t.id and q.status = 'approved' and qi.warranty_days > 0
  on conflict (quote_item_id) do nothing;

  if t.equipment_id is not null then
    select coalesce((select (value #>> '{}')::int from public.app_settings where key = 'maintenance.default_months'), 6) into v_months;
    select coalesce(d.next_maintenance_at, now() + make_interval(months => v_months)) into v_due
    from (select next_maintenance_at from public.deliveries where ticket_id = t.id) d;
    v_due := coalesce(v_due, now() + make_interval(months => v_months));
    insert into public.crm_tasks (customer_id, equipment_id, ticket_id, task_type, due_at, note, created_by)
    values (t.customer_id, t.equipment_id, t.id, 'maintenance', v_due, 'Mantenimiento preventivo recomendado tras la entrega', p_actor)
    returning id into v_task;
    insert into public.maintenance_plans (customer_id, equipment_id, ticket_id, crm_task_id, due_at, interval_months)
    values (t.customer_id, t.equipment_id, t.id, v_task, v_due, v_months);
    insert into public.calendar_events (event_type, title, starts_at, customer_id, ticket_id, crm_task_id, created_by)
    values ('maintenance', 'Mantenimiento recomendado · ' || t.code, v_due, t.customer_id, t.id, v_task, p_actor);
    update public.equipment set next_maintenance_at = v_due where id = t.equipment_id;
    insert into public.equipment_history (equipment_id, ticket_id, event_type, actor_id) values (t.equipment_id, t.id, 'delivered', p_actor);
  end if;
end $$;

-- Núcleo único de transiciones. p_system = true solo desde funciones internas (p. ej. aprobación del cliente).
create function private.apply_transition(
  p_ticket uuid, p_to public.ticket_status, p_actor uuid, p_actor_role text, p_reason text, p_system boolean default false
) returns public.ticket_status
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype; tr public.ticket_transitions%rowtype; v_min int; v_n int; v_reason text := nullif(btrim(p_reason), '');
begin
  select * into t from public.tickets where id = p_ticket and deleted_at is null for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into tr from public.ticket_transitions where from_status = t.status and to_status = p_to;
  if not found then raise exception 'invalid_transition: % -> %', t.status, p_to using errcode = 'P0001'; end if;
  if not p_system and not (p_actor_role::public.app_role = any (tr.allowed_roles)) then
    raise exception 'forbidden_transition' using errcode = '42501';
  end if;
  if tr.requires_reason and v_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;

  -- precondiciones de negocio
  if p_to = 'diagnosing' and t.status = 'received' then
    if not exists (select 1 from public.receptions where ticket_id = t.id) then
      raise exception 'precondition_failed: reception_missing' using errcode = 'P0001';
    end if;
    select coalesce((select (value #>> '{}')::int from public.app_settings where key = 'reception.min_photos'), 0) into v_min;
    select count(*) into v_n from public.evidence where ticket_id = t.id and stage = 'reception' and deleted_at is null;
    if v_n < v_min then raise exception 'precondition_failed: reception_photos_missing' using errcode = 'P0001'; end if;
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
  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  select c.profile_id, 'ticket.status_changed', 'Tu ticket ' || t.code || ': ' || private.status_label(p_to), null, 'ticket', t.id
  from public.customers c where c.id = t.customer_id and c.profile_id is not null;
  if p_to = 'delivered' then perform private.on_delivered(t, p_actor); end if;
  return p_to;
end $$;

create function public.transition_ticket(p_ticket uuid, p_to public.ticket_status, p_reason text default null)
returns public.ticket_status
language plpgsql security definer set search_path = '' as $$
declare v_role public.app_role := private.my_role();
begin
  if auth.uid() is null or v_role is null or v_role = 'client' then raise exception 'forbidden' using errcode = '42501'; end if;
  if not private.can_manage_ticket(p_ticket) then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.apply_transition(p_ticket, p_to, auth.uid(), v_role::text, p_reason, false);
end $$;

create function public.assign_ticket(p_ticket uuid, p_staff uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_staff and role in ('technician', 'admin') and is_active and deleted_at is null) then
    raise exception 'assignee_not_staff' using errcode = '23514';
  end if;
  update public.tickets set assigned_to = p_staff where id = p_ticket and deleted_at is null and status not in ('delivered', 'cancelled');
  if not found then raise exception 'ticket_not_assignable' using errcode = 'P0002'; end if;
  insert into public.ticket_notes (ticket_id, author_id, kind, visibility, body) values (p_ticket, auth.uid(), 'assignment', 'internal', 'Ticket asignado');
  perform private.write_audit(auth.uid(), 'admin', 'ticket.assigned', 'tickets', p_ticket::text, jsonb_build_object('assignee', p_staff));
end $$;

-- ---------------------------------------------------------------- cliente
create function public.cancel_service_request(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.service_requests set status = 'cancelled'
  where id = p_id and customer_id = private.my_customer_id() and status in ('pending', 'scheduled');
  if not found then raise exception 'request_not_cancellable' using errcode = 'P0002'; end if;
  perform private.write_audit(auth.uid(), 'client', 'service_request.cancelled', 'service_requests', p_id::text, '{}'::jsonb);
end $$;

-- Aceptación legal: registra la versión exacta, la IP y el agente de usuario. Inmutable.
create function public.accept_legal_document(p_document uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ua text;
begin
  if auth.uid() is null or private.my_role() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.legal_documents where id = p_document and status = 'published') then
    raise exception 'document_not_published' using errcode = 'P0002';
  end if;
  begin v_ua := left(current_setting('request.headers', true)::jsonb ->> 'user-agent', 300); exception when others then v_ua := null; end;
  insert into public.legal_acceptances (profile_id, legal_document_id, ip, user_agent)
  values (auth.uid(), p_document, private.request_ip(), v_ua)
  on conflict (profile_id, legal_document_id) do nothing;
end $$;

-- Seguimiento público por token no adivinable. Sin datos personales. (El servidor aplica límite de intentos.)
create function public.track_ticket(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.tickets%rowtype;
begin
  if p_token is null or p_token !~ '^[a-z2-9]{12}$' then return null; end if;
  select * into t from public.tickets where tracking_token = p_token and deleted_at is null;
  if not found then return null; end if;
  return jsonb_build_object(
    'code', t.code, 'status', t.status, 'status_label', private.status_label(t.status), 'received_at', t.received_at,
    'history', coalesce((select jsonb_agg(jsonb_build_object('status', h.to_status, 'label', private.status_label(h.to_status), 'at', h.created_at) order by h.created_at)
                         from public.ticket_status_history h where h.ticket_id = t.id), '[]'::jsonb));
end $$;
