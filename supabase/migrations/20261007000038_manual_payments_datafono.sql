-- Pagos manuales con método, referencia y comprobante (datáfono) + validación de transferencias.
-- Reglas (todas en el servidor, nunca en el navegador):
--   * Efectivo: se confirma al registrar. Datáfono: el comprobante (foto privada) es OBLIGATORIO. Transferencia: nace «pendiente de
--     validación» y solo el SUPERADMIN la confirma; subir una imagen no confirma nada.
--   * Un concepto (diagnóstico / servicio / cotización) solo admite UN cobro activo: los índices únicos parciales ya lo impiden en BD
--     y la función lo comprueba antes para devolver un error claro. No se anula un pago en línea en validación por el camino manual.
alter type public.evidence_stage add value if not exists 'payment';

alter table public.evidence drop constraint if exists evidence_slot_check;
alter table public.evidence add constraint evidence_slot_check
  check (slot is null or slot in ('front', 'back', 'screen', 'serial', 'left', 'right', 'charger', 'damage', 'other', 'voucher'));

alter table public.payments
  add column if not exists reference text check (reference is null or char_length(reference) <= 80),
  add column if not exists note text check (note is null or char_length(note) <= 300),
  add column if not exists voucher_evidence_id uuid references public.evidence (id) on delete restrict;

-- ---------------------------------------------------------------- registro manual (técnico asignado o SUPERADMIN)
create or replace function public.record_manual_service_payment_v2(
  p_actor uuid, p_kind text, p_ref uuid, p_method text, p_reference text default null, p_note text default null, p_voucher uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s record; v_pay uuid; v_role text; v_ticket uuid; v_assigned uuid; v_status public.payment_status;
  v_ref text := nullif(btrim(p_reference), ''); v_note text := nullif(btrim(p_note), '');
begin
  select role::text into v_role from public.profiles where id = p_actor and is_active and deleted_at is null;
  if v_role is null or v_role not in ('superadmin', 'technician') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_method not in ('cash', 'datafono', 'bank_transfer', 'other') then raise exception 'invalid_method' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('manual:' || p_kind || ':' || p_ref::text, 0));
  select * into s from private.service_amount(p_kind, p_ref);
  v_ticket := s.v_ticket;
  if v_role = 'technician' then
    select assigned_to into v_assigned from public.tickets where id = v_ticket;
    if v_assigned is distinct from p_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  -- ya hay un cobro en curso (en línea en validación o transferencia pendiente): no se duplica
  if exists (select 1 from public.payments pa where pa.purpose = p_kind and pa.status = 'pending'
              and ((p_kind = 'quote' and pa.quote_id = p_ref) or (p_kind in ('diagnosis', 'service') and pa.ticket_id = p_ref))) then
    raise exception 'payment_in_validation' using errcode = 'P0001';
  end if;
  if p_method = 'datafono' and p_voucher is null then raise exception 'voucher_required' using errcode = 'P0001'; end if;
  if p_voucher is not null then
    if not exists (select 1 from public.evidence e where e.id = p_voucher and e.ticket_id = v_ticket and e.stage = 'payment' and e.deleted_at is null) then
      raise exception 'voucher_invalid' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.payments where voucher_evidence_id = p_voucher) then raise exception 'voucher_reused' using errcode = 'P0001'; end if;
  end if;
  v_status := case when p_method = 'bank_transfer' then 'pending' else 'approved' end;
  insert into public.payments (customer_id, quote_id, ticket_id, purpose, provider, method, status, amount, approved_at, confirmed_by, reference, note, voucher_evidence_id)
  values (s.v_customer, case when p_kind = 'quote' then p_ref end, case when p_kind in ('diagnosis', 'service') then p_ref else s.v_ticket end, p_kind,
          'manual', p_method, v_status, s.v_amount, case when v_status = 'approved' then now() end, case when v_status = 'approved' then p_actor end,
          v_ref, v_note, p_voucher)
  returning id into v_pay;
  if v_status = 'approved' then perform private.settle_payment(v_pay); end if;
  perform private.write_audit(p_actor, v_role, case when v_status = 'approved' then 'payment.manual_confirmed' else 'payment.manual_pending' end,
    'payments', v_pay::text, jsonb_build_object('method', p_method, 'amount', s.v_amount, 'purpose', p_kind, 'voucher', p_voucher is not null));
  return v_pay;
end $$;

-- ---------------------------------------------------------------- confirmar una transferencia pendiente (solo SUPERADMIN)
create or replace function public.confirm_manual_payment(p_actor uuid, p_payment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pay public.payments%rowtype;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'superadmin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into pay from public.payments where id = p_payment for update;
  if not found or pay.provider <> 'manual' or pay.status <> 'pending' then raise exception 'payment_not_pending' using errcode = 'P0001'; end if;
  update public.payments set status = 'approved', approved_at = now(), confirmed_by = p_actor where id = pay.id;
  perform private.settle_payment(pay.id);
  perform private.write_audit(p_actor, 'superadmin', 'payment.manual_confirmed', 'payments', pay.id::text, jsonb_build_object('method', pay.method, 'amount', pay.amount, 'validated', true));
end $$;

-- ---------------------------------------------------------------- anular un intento pendiente (en línea abandonado o transferencia no recibida)
create or replace function public.cancel_pending_payment(p_actor uuid, p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare pay public.payments%rowtype;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'superadmin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into pay from public.payments where id = p_payment for update;
  if not found or pay.status <> 'pending' then raise exception 'payment_not_pending' using errcode = 'P0001'; end if;
  update public.payments set status = 'cancelled', note = left(coalesce(note || ' · ', '') || 'Anulado: ' || btrim(p_reason), 300) where id = pay.id;
  perform private.write_audit(p_actor, 'superadmin', 'payment.cancelled', 'payments', pay.id::text, jsonb_build_object('provider', pay.provider, 'reason', left(btrim(p_reason), 200)));
end $$;

-- Las transferencias pendientes de validación no vencen solas: solo se vencen los pagos en línea abandonados
-- (conserva la tarea de seguimiento del CRM de la migración 33).
create or replace function public.expire_pending_service_payments() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with expired as (
    update public.payments set status = 'expired'
     where purpose in ('quote', 'diagnosis', 'service') and status = 'pending' and provider = 'mercadopago' and created_at < now() - interval '48 hours'
    returning customer_id, ticket_id, code
  ), ins as (
    insert into public.crm_tasks (customer_id, ticket_id, task_type, due_at, note)
    select distinct on (e.ticket_id) e.customer_id, e.ticket_id, 'followup', now(), left('Pago sin completar (' || coalesce(e.code, 'pago en línea') || '). Contactar al cliente para ayudarle a terminar.', 500)
    from expired e
    where e.ticket_id is not null
      and not exists (select 1 from public.crm_tasks c where c.ticket_id = e.ticket_id and c.task_type = 'followup' and c.status in ('pending', 'contacted', 'interested', 'scheduled', 'no_answer') and c.note like 'Pago sin completar%')
    returning 1
  )
  select count(*) into n from expired;
  return n;
end $$;

revoke execute on function public.record_manual_service_payment_v2(uuid, text, uuid, text, text, text, uuid),
  public.confirm_manual_payment(uuid, uuid), public.cancel_pending_payment(uuid, uuid, text),
  public.expire_pending_service_payments() from public, anon, authenticated;
grant execute on function public.record_manual_service_payment_v2(uuid, text, uuid, text, text, text, uuid),
  public.confirm_manual_payment(uuid, uuid), public.cancel_pending_payment(uuid, uuid, text), public.expire_pending_service_payments() to service_role;

-- La versión anterior (solo SUPERADMIN, anulaba el pago en línea pendiente) deja de ser invocable: todo pasa por la v2.
revoke execute on function public.record_manual_service_payment(uuid, text, uuid, text) from service_role;
revoke execute on function public.record_diagnosis_payment(uuid, uuid, text) from service_role;

-- El técnico ve el estado de los cobros de los tickets que puede gestionar (para no ofrecer «registrar pago» si ya está pagado).
-- Solo lectura: registrar/confirmar/anular sigue pasando por las funciones de servidor.
create policy payments_technician_read on public.payments for select to authenticated
  using (ticket_id is not null and (select private.is_technician()) and (select private.can_view_ticket(ticket_id)));
