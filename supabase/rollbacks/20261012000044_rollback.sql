-- REVERSIÓN de la migración 20261012000044 (solo para emergencias; no es una migración y el CLI no la ejecuta).
-- Restaura las dos funciones a su definición EXACTA de producción previa a la 44 (extraída con pg_get_functiondef el 2026-10-12 antes de aplicarla)
-- y retira lo que la 44 agregó. Antes de ejecutarla: copia de seguridad fresca. Después: `delete from supabase_migrations.schema_migrations where version = '20261012000044';`.
-- ADVERTENCIA: `drop table ticket_exceptions` y las columnas de firma borran las excepciones y el canal de captura registrados desde la 44.
begin;
drop trigger if exists documents_notify_created on public.documents;
drop trigger if exists documents_notify_signed on public.documents;
drop function if exists private.on_document_created();
drop function if exists private.on_document_signed();
drop function if exists public.notify_document_available(uuid);
drop function if exists public.authorize_reception_exception(uuid, uuid, text);
CREATE OR REPLACE FUNCTION private.apply_transition(p_ticket uuid, p_to ticket_status, p_actor uuid, p_actor_role text, p_reason text, p_system boolean DEFAULT false)
 RETURNS ticket_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION private.notify(p_event text, p_recipient uuid, p_type text, p_title text, p_body text, p_entity_type text, p_entity_id uuid, p_priority text DEFAULT 'normal'::text, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_recipient is null or p_recipient is not distinct from p_actor then return; end if;
  if not exists (select 1 from public.profiles where id = p_recipient and is_active and deleted_at is null) then return; end if;
  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id, event_key, priority)
  values (p_recipient, p_type, left(p_title, 160), left(p_body, 500), p_entity_type, p_entity_id, p_event, p_priority)
  on conflict (recipient_id, event_key) where event_key is not null do nothing;
end $function$
;
drop function if exists private.reception_signed(uuid);
drop table if exists public.ticket_exceptions;
alter table public.document_signatures drop constraint if exists document_signatures_assisted_chk;
alter table public.document_signatures drop constraint if exists document_signatures_signer_chk;
-- Solo si NO hay firmas presenciales registradas (signer_profile_id nulo): de lo contrario esta línea falla a propósito.
alter table public.document_signatures alter column signer_profile_id set not null;
alter table public.document_signatures drop column if exists captured_by;
alter table public.document_signatures drop column if exists capture_channel;
-- Las copias de supervisión creadas desde la 44 quedan como avisos normales de tipo `supervision`; si no se desean: delete from public.notifications where type = 'supervision';
commit;
