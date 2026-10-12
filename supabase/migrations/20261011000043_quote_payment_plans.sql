-- PAGO DE COTIZACIONES: anticipo del 50 % o pago total con 5 % de descuento, saldo auditable y servicio bloqueado hasta el pago.
-- Reglas (todas en la base de datos; el navegador solo elige la modalidad):
--   * Base = total de la cotización (ya NETO del crédito por diagnóstico, que se calcula una sola vez en recompute_quote), en pesos enteros.
--   * Anticipo (deposit): round(base × 50 %), sin descuento. Saldo (balance): base − pagado − descuento, sin volver a descontar nada.
--   * Total (full): descuento = round(base × 5 %); se cobra base − descuento. Solo si todavía no hay ningún pago confirmado.
--   * Cada cobro guarda modalidad, importe, descuento y el cálculo usado (versión de la cotización, base, crédito, tasa) para auditoría.
--   * La aprobación de la cotización NO inicia el servicio si hay algo que cobrar: el ticket pasa a «En servicio» (o «Esperando repuesto»)
--     cuando se CONFIRMA el primer pago (anticipo o total). No se entrega el equipo con saldo pendiente.

-- ---------------------------------------------------------------- esquema (aditivo)
alter table public.payments
  add column if not exists installment text check (installment is null or installment in ('deposit', 'balance', 'full')),
  add column if not exists discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  add column if not exists pricing_detail jsonb check (pricing_detail is null or pg_column_size(pricing_detail) < 4096);
alter table public.payments add constraint payments_installment_only_quote check (installment is null or purpose = 'quote');

alter table public.quotes
  add column if not exists payment_plan text check (payment_plan is null or payment_plan in ('deposit', 'full')),
  add column if not exists amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  add column if not exists early_discount numeric(12, 2) not null default 0 check (early_discount >= 0);

-- Antes: un solo cobro activo por cotización. Ahora: uno por modalidad (anticipo y saldo son dos cobros distintos).
drop index if exists public.payments_one_active_quote;
create unique index payments_one_active_quote on public.payments (quote_id, coalesce(installment, 'full'))
  where purpose = 'quote' and status in ('pending', 'approved');

-- ---------------------------------------------------------------- cálculo único (lo usan el cobro, los paneles y las pruebas)
create function private.quote_money(p_quote uuid)
returns table (base numeric, paid numeric, discount numeric, balance numeric, plan text, approved_count int)
language sql stable security definer set search_path = '' as $$
  with q as (select round(total, 0) as base from public.quotes where id = p_quote),
       p as (select coalesce(sum(amount), 0) as paid, coalesce(sum(discount_amount), 0) as disc, count(*)::int as n,
                    (array_agg(installment order by created_at) filter (where installment in ('deposit', 'full')))[1] as plan
               from public.payments where quote_id = p_quote and purpose = 'quote' and status = 'approved')
  select q.base, p.paid, p.disc, greatest(q.base - p.paid - p.disc, 0), p.plan, p.n from q, p
$$;

/** Importe de UNA modalidad de pago de una cotización aprobada (deposit | full | balance). Lanza el motivo si no aplica. */
create function private.quote_installment(p_quote uuid, p_plan text,
  out v_customer uuid, out v_amount numeric, out v_discount numeric, out v_title text, out v_ticket uuid, out v_detail jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare q public.quotes%rowtype; m record; v_tstatus public.ticket_status;
begin
  if p_plan not in ('deposit', 'full', 'balance') then raise exception 'invalid_plan' using errcode = '22023'; end if;
  select * into q from public.quotes where id = p_quote;
  if not found then raise exception 'quote_not_found' using errcode = 'P0002'; end if;
  if q.status <> 'approved' then raise exception 'quote_not_payable' using errcode = 'P0001'; end if;
  select * into m from private.quote_money(p_quote);
  if m.base <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;
  if m.balance <= 0 then raise exception 'quote_already_paid' using errcode = 'P0001'; end if;
  if q.ticket_id is not null then select status into v_tstatus from public.tickets where id = q.ticket_id; end if;
  if v_tstatus in ('cancelled', 'delivered') then raise exception 'ticket_closed' using errcode = 'P0001'; end if;
  v_discount := 0;
  if p_plan = 'deposit' then
    if m.approved_count > 0 then raise exception 'plan_already_chosen' using errcode = 'P0001'; end if;
    v_amount := round(m.base * 0.5, 0);
    v_title := 'Anticipo 50 % · ' || q.code;
  elsif p_plan = 'full' then
    if m.approved_count > 0 then raise exception 'plan_already_chosen' using errcode = 'P0001'; end if;
    v_discount := round(m.base * 0.05, 0);
    v_amount := m.base - v_discount;
    v_title := 'Pago total (5 % de descuento) · ' || q.code;
  else
    -- Saldo: tras el anticipo, o en un servicio que ya avanzó sin cobro previo (cotizaciones anteriores a esta regla). Nunca con descuento.
    if m.approved_count = 0 and coalesce(v_tstatus::text, 'awaiting_approval') = 'awaiting_approval' then
      raise exception 'plan_required' using errcode = 'P0001';
    end if;
    v_amount := m.balance;
    v_title := 'Saldo restante · ' || q.code;
  end if;
  if v_amount <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;
  v_customer := q.customer_id; v_ticket := q.ticket_id;
  v_detail := jsonb_build_object('plan', p_plan, 'quote_version', q.version, 'quote_total', q.total, 'base', m.base,
    'diagnosis_credit', q.diagnosis_credit, 'paid_before', m.paid, 'discount_rate', case when p_plan = 'full' then 5 else 0 end,
    'discount', v_discount, 'amount', v_amount, 'rule', 'v1');
end $$;

-- El camino genérico ya no cobra cotizaciones: exige elegir modalidad (begin_quote_payment / record_manual_quote_payment).
create or replace function private.service_amount(p_kind text, p_ref uuid, out v_customer uuid, out v_amount numeric, out v_title text, out v_ticket uuid)
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype; s public.services%rowtype;
begin
  if p_kind in ('diagnosis', 'service') then
    select * into t from public.tickets where id = p_ref;
    if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
    if t.status in ('cancelled', 'delivered') then raise exception 'ticket_closed' using errcode = 'P0001'; end if;
    select * into s from public.services where id = t.service_id;
    if p_kind = 'diagnosis' then
      if not coalesce(s.is_diagnostic_fee, false) then raise exception 'ticket_not_diagnosis' using errcode = 'P0001'; end if;
      if exists (select 1 from public.diagnosis_credits where ticket_id = t.id) then raise exception 'diagnosis_already_paid' using errcode = 'P0001'; end if;
      v_title := 'Diagnóstico · ' || t.code;
    else
      if coalesce(s.is_diagnostic_fee, false) then raise exception 'ticket_is_diagnosis' using errcode = 'P0001'; end if;
      if coalesce(public.service_flow(t.service_id, t.modality), 'quote') <> 'immediate' or not s.allow_online_payment then raise exception 'service_not_payable' using errcode = 'P0001'; end if;
      if t.prepaid_at is not null then raise exception 'service_already_paid' using errcode = 'P0001'; end if;
      v_title := left(coalesce(s.name, 'Servicio'), 60) || ' · ' || t.code;
    end if;
    v_amount := coalesce((t.service_snapshot ->> 'base_price')::numeric, s.base_price);
    if v_amount is null or v_amount <= 0 then raise exception 'price_unavailable' using errcode = 'P0001'; end if;
    v_customer := t.customer_id; v_ticket := t.id;
  elsif p_kind = 'quote' then
    raise exception 'plan_required' using errcode = 'P0001';
  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
end $$;

-- ---------------------------------------------------------------- pago en línea de la cotización (cliente dueño)
create function public.begin_quote_payment(p_actor uuid, p_quote uuid, p_plan text)
returns table (payment_id uuid, amount numeric, title text, external_reference text, ticket_id uuid)
language plpgsql security definer set search_path = '' as $$
declare s record; p public.payments%rowtype;
begin
  -- Serializa intentos simultáneos (doble clic, dos pestañas) sobre la misma cotización.
  perform pg_advisory_xact_lock(hashtextextended('quote-pay:' || p_quote::text, 0));
  select * into s from private.quote_installment(p_quote, p_plan);
  if not exists (select 1 from public.customers c where c.id = s.v_customer and c.profile_id = p_actor) then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Un cobro en curso de la MISMA modalidad e importe se reutiliza; uno distinto bloquea (no se descarta un pago que podría estar pagándose).
  select * into p from public.payments pa where pa.quote_id = p_quote and pa.purpose = 'quote' and pa.status = 'pending' order by pa.created_at desc limit 1;
  if found then
    if p.provider = 'mercadopago' and p.installment = p_plan and p.amount = s.v_amount then
      return query select p.id, p.amount, s.v_title, p.external_reference, s.v_ticket;
      return;
    end if;
    raise exception 'payment_in_validation' using errcode = 'P0001';
  end if;
  insert into public.payments (customer_id, quote_id, ticket_id, purpose, provider, status, amount, installment, discount_amount, pricing_detail)
  values (s.v_customer, p_quote, s.v_ticket, 'quote', 'mercadopago', 'pending', s.v_amount, p_plan, s.v_discount, s.v_detail)
  returning * into p;
  update public.payments set external_reference = 'pay-' || p.id::text where id = p.id returning * into p;
  perform private.write_audit(p_actor, 'client', 'payment.quote_started', 'payments', p.id::text, s.v_detail);
  return query select p.id, p.amount, s.v_title, p.external_reference, s.v_ticket;
end $$;

-- ---------------------------------------------------------------- pago manual de la cotización (técnico asignado o SUPERADMIN)
create function public.record_manual_quote_payment(
  p_actor uuid, p_quote uuid, p_plan text, p_method text, p_reference text default null, p_note text default null, p_voucher uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s record; v_pay uuid; v_role text; v_assigned uuid; v_status public.payment_status;
  v_ref text := nullif(btrim(p_reference), ''); v_note text := nullif(btrim(p_note), '');
begin
  select role::text into v_role from public.profiles where id = p_actor and is_active and deleted_at is null;
  if v_role is null or v_role not in ('superadmin', 'technician') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_method not in ('cash', 'datafono', 'bank_transfer', 'other') then raise exception 'invalid_method' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('quote-pay:' || p_quote::text, 0));
  select * into s from private.quote_installment(p_quote, p_plan);
  if v_role = 'technician' then
    select assigned_to into v_assigned from public.tickets where id = s.v_ticket;
    if v_assigned is distinct from p_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  if exists (select 1 from public.payments pa where pa.quote_id = p_quote and pa.purpose = 'quote' and pa.status = 'pending') then
    raise exception 'payment_in_validation' using errcode = 'P0001';
  end if;
  if p_method = 'datafono' and p_voucher is null then raise exception 'voucher_required' using errcode = 'P0001'; end if;
  if p_voucher is not null then
    if not exists (select 1 from public.evidence e where e.id = p_voucher and e.ticket_id = s.v_ticket and e.stage = 'payment' and e.deleted_at is null) then
      raise exception 'voucher_invalid' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.payments where voucher_evidence_id = p_voucher) then raise exception 'voucher_reused' using errcode = 'P0001'; end if;
  end if;
  v_status := case when p_method = 'bank_transfer' then 'pending' else 'approved' end;
  insert into public.payments (customer_id, quote_id, ticket_id, purpose, provider, method, status, amount, approved_at, confirmed_by,
                               reference, note, voucher_evidence_id, installment, discount_amount, pricing_detail)
  values (s.v_customer, p_quote, s.v_ticket, 'quote', 'manual', p_method, v_status, s.v_amount,
          case when v_status = 'approved' then now() end, case when v_status = 'approved' then p_actor end,
          v_ref, v_note, p_voucher, p_plan, s.v_discount, s.v_detail)
  returning id into v_pay;
  if v_status = 'approved' then perform private.settle_payment(v_pay); end if;
  perform private.write_audit(p_actor, v_role, case when v_status = 'approved' then 'payment.manual_confirmed' else 'payment.manual_pending' end,
    'payments', v_pay::text, s.v_detail || jsonb_build_object('method', p_method, 'voucher', p_voucher is not null));
  return v_pay;
end $$;

-- ---------------------------------------------------------------- resumen para pantallas (cliente dueño o personal autorizado)
create function public.quote_payment_summary(p_quote uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q public.quotes%rowtype; m record; v_pplan text; v_pamount numeric; v_pprov text; v_psince timestamptz; v_tstatus text; v_dep numeric; v_fdisc numeric;
begin
  if auth.uid() is null or not private.can_view_quote(p_quote) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote;
  if not found then raise exception 'quote_not_found' using errcode = 'P0002'; end if;
  select * into m from private.quote_money(p_quote);
  select pa.installment, pa.amount, pa.provider::text, pa.created_at into v_pplan, v_pamount, v_pprov, v_psince
    from public.payments pa where pa.quote_id = p_quote and pa.purpose = 'quote' and pa.status = 'pending' order by pa.created_at desc limit 1;
  if q.ticket_id is not null then select status::text into v_tstatus from public.tickets where id = q.ticket_id; end if;
  v_dep := round(m.base * 0.5, 0);
  v_fdisc := round(m.base * 0.05, 0);
  return jsonb_build_object(
    'status', q.status, 'code', q.code, 'version', q.version,
    'items_total', q.subtotal - q.discount_total + q.urgency_amount + q.delivery_fee,
    'diagnosis_credit', q.diagnosis_credit, 'base', m.base, 'paid', m.paid, 'discount', m.discount, 'balance', m.balance,
    'plan', m.plan, 'approved_count', m.approved_count, 'paid_in_full', m.balance <= 0 and m.base > 0,
    'deposit_amount', v_dep, 'deposit_remaining', m.base - v_dep,
    'full_discount', v_fdisc, 'full_amount', m.base - v_fdisc,
    'pending_plan', v_pplan, 'pending_amount', v_pamount, 'pending_provider', v_pprov, 'pending_since', v_psince,
    'can_choose', q.status = 'approved' and m.base > 0 and m.approved_count = 0 and v_pplan is null and coalesce(v_tstatus, '') not in ('cancelled', 'delivered'),
    'can_pay_balance', q.status = 'approved' and m.balance > 0 and v_pplan is null and (m.approved_count > 0 or coalesce(v_tstatus, 'awaiting_approval') <> 'awaiting_approval')
      and coalesce(v_tstatus, '') not in ('cancelled', 'delivered'),
    'ticket_status', v_tstatus);
end $$;

-- ---------------------------------------------------------------- liquidación (idempotente): saldo, plan y habilitación del servicio
create or replace function private.settle_payment(p_payment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pay public.payments%rowtype; v_quote uuid; m record; q public.quotes%rowtype; v_tstatus public.ticket_status;
begin
  select * into pay from public.payments where id = p_payment;
  if not found or pay.status <> 'approved' then return; end if;
  if pay.purpose = 'order' then
    update public.orders set paid_at = coalesce(paid_at, now()) where id = pay.order_id;
    perform private.create_installation_tickets(pay.order_id);
  elsif pay.purpose = 'quote' then
    select * into m from private.quote_money(pay.quote_id);
    update public.quotes set amount_paid = m.paid, early_discount = m.discount, payment_plan = coalesce(payment_plan, m.plan),
           paid_at = case when m.balance <= 0 then coalesce(paid_at, now()) else paid_at end
     where id = pay.quote_id
    returning * into q;
    -- Primer pago confirmado (anticipo o total): el servicio puede empezar. Transición del sistema, con sus precondiciones.
    if q.ticket_id is not null and q.status = 'approved' then
      select status into v_tstatus from public.tickets where id = q.ticket_id;
      if v_tstatus = 'awaiting_approval' then
        perform private.apply_transition(q.ticket_id, case when q.needs_part then 'awaiting_part' else 'in_service' end::public.ticket_status,
          null, 'system', 'Pago de la cotización confirmado', true);
      end if;
    end if;
  elsif pay.purpose = 'service' then
    update public.tickets set prepaid_at = coalesce(prepaid_at, now()), prepaid_amount = coalesce(prepaid_amount, pay.amount) where id = pay.ticket_id;
  else
    insert into public.diagnosis_credits (customer_id, ticket_id, payment_id, amount) values (pay.customer_id, pay.ticket_id, pay.id, pay.amount)
    on conflict (payment_id) do nothing;
    select id into v_quote from public.quotes where ticket_id = pay.ticket_id and status = 'draft';
    if v_quote is not null then perform private.recompute_quote(v_quote); end if;
  end if;
  perform private.notify_payment_approved(pay);
end $$;

-- ---------------------------------------------------------------- aprobación: no inicia el servicio si hay algo que cobrar
create or replace function public.decide_quote(p_quote uuid, p_decision text, p_message text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype; v_msg text := nullif(btrim(p_message), '');
  d_code text; d_version int; d_sha text; v_note text;
begin
  if auth.uid() is null or private.my_role() is distinct from 'client' then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote and customer_id = private.my_customer_id() for update;
  if not found then raise exception 'quote_not_found' using errcode = 'P0002'; end if;
  if q.status not in ('sent', 'clarification') then raise exception 'quote_not_open' using errcode = 'P0001'; end if;
  if q.valid_until is not null and q.valid_until < (now() at time zone 'America/Bogota')::date then
    raise exception 'quote_expired' using errcode = 'P0001';
  end if;

  if p_decision = 'approve' then
    select dc.code, dc.version, dc.sha256 into d_code, d_version, d_sha
      from public.documents dc where dc.quote_id = q.id and dc.doc_type = 'quote' and dc.status <> 'superseded'
      order by dc.version desc limit 1;
    v_note := case when d_sha is null then v_msg
                   else concat_ws(' · ', v_msg, 'Aprobada sobre el documento ' || d_code || ' v' || d_version || ' (SHA-256 ' || d_sha || ')') end;
    perform private.consume_diagnosis_credit(q.id);
    update public.quotes set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = q.id;
    perform private.quote_event(q.id, 'approved', 'client', v_note);
    perform private.write_audit(auth.uid(), 'client', 'quote.approved', 'quotes', q.id::text,
      jsonb_build_object('total', q.total, 'document', d_code, 'document_version', d_version, 'document_sha256', d_sha));
    if q.ticket_id is not null then
      -- Sin nada que cobrar (el crédito cubre todo) se inicia de una vez; si no, el servicio empieza al confirmarse el pago.
      if round(q.total, 0) <= 0 then
        perform private.apply_transition(q.ticket_id, case when q.needs_part then 'awaiting_part' else 'in_service' end::public.ticket_status,
          auth.uid(), 'client', 'Cotización aprobada por el cliente', true);
      end if;
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
revoke execute on function public.decide_quote(uuid, text, text) from public, anon;
grant execute on function public.decide_quote(uuid, text, text) to authenticated;

create or replace function public.record_in_person_approval(p_quote uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; v_role public.app_role := private.my_role();
begin
  if v_role is null or v_role = 'client' or not private.can_manage_quote(p_quote) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if q.status not in ('sent', 'clarification') then raise exception 'quote_not_open' using errcode = 'P0001'; end if;
  perform private.consume_diagnosis_credit(q.id);
  update public.quotes set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = q.id;
  perform private.quote_event(q.id, 'approved', v_role::text, 'Aprobación presencial registrada por el personal');
  perform private.write_audit(auth.uid(), v_role::text, 'quote.approved_in_person', 'quotes', q.id::text, jsonb_build_object('total', q.total));
  if q.ticket_id is not null and round(q.total, 0) <= 0 then
    perform private.apply_transition(q.ticket_id, case when q.needs_part then 'awaiting_part' else 'in_service' end::public.ticket_status,
      auth.uid(), v_role::text, 'Aprobación presencial', false);
  end if;
end $$;

-- ---------------------------------------------------------------- transiciones: pago antes de iniciar, saldo antes de entregar
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

-- ---------------------------------------------------------------- avisos del cobro de cotizaciones
create or replace function private.notify_payment_approved(pay public.payments) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype; v_cust uuid := private.profile_of_customer(pay.customer_id); v_key text := 'payok:' || pay.id; v_body text; v_title text;
  v_amount text; m record;
begin
  if pay.ticket_id is not null then select * into t from public.tickets where id = pay.ticket_id; end if;
  v_amount := '$' || to_char(pay.amount, 'FM999G999G999');
  v_title := '¡Recibimos tu pago!';
  if pay.purpose = 'quote' then
    select * into m from private.quote_money(pay.quote_id);
    if pay.installment = 'deposit' then
      v_title := '¡Pago confirmado!';
      v_body := 'Ya recibimos tu anticipo. Estamos preparando el inicio del servicio y te mantendremos informado. El saldo restante se paga antes de la entrega.';
    elsif pay.installment = 'full' then
      v_title := 'Pago completo confirmado';
      v_body := 'Tu cotización quedó pagada con el 5 % de descuento. Estamos preparando el inicio del servicio y te mantendremos informado.';
    else
      v_title := 'Saldo pagado';
      v_body := 'Recibimos el pago del saldo. Tu servicio quedó pagado por completo.';
    end if;
  elsif pay.purpose in ('diagnosis', 'service') then
    v_body := 'Tu pago está confirmado. ' || private.modality_next_step(coalesce(t.modality::text, 'store'));
  else
    v_body := 'Tu pago está confirmado. Te contactaremos para coordinar la entrega.';
  end if;
  perform private.notify(v_key, v_cust, 'payment.approved', v_title, v_body, case when pay.ticket_id is not null then 'ticket' else 'payment' end, coalesce(pay.ticket_id, pay.id), 'high', null);
  if pay.purpose in ('diagnosis', 'service') and t.id is not null then
    perform private.notify(v_key, t.assigned_to, 'payment.cleared', 'Pago confirmado: ' || t.code, 'El pago ya está confirmado; puedes continuar con el servicio.', 'ticket', t.id, 'normal', pay.confirmed_by);
  elsif pay.purpose = 'quote' and t.id is not null then
    perform private.notify(v_key, t.assigned_to, 'payment.cleared',
      case pay.installment when 'deposit' then 'Anticipo confirmado: ' when 'full' then 'Pago completo: ' else 'Saldo liquidado: ' end || t.code,
      case when pay.installment = 'balance' then 'La cotización quedó liquidada; puedes coordinar la entrega.'
           else 'El pago de la cotización está confirmado; puedes iniciar la intervención si se cumplen las demás condiciones.' end,
      'ticket', t.id, 'high', pay.confirmed_by);
    perform private.notify_superadmins(v_key, 'payment.quote', 'Pago de cotización: ' || v_amount,
      case pay.installment when 'deposit' then 'Anticipo confirmado; queda saldo pendiente.' when 'full' then 'Pago total confirmado (5 % de descuento).' else 'Saldo liquidado.' end,
      'ticket', t.id, 'normal', pay.confirmed_by);
  end if;
  if pay.provider = 'manual' and pay.purpose <> 'quote' then
    perform private.notify_superadmins(v_key, 'payment.received', 'Pago manual registrado: ' || v_amount, 'Pago ' || coalesce(pay.method, 'manual') || ' registrado; revisa la conciliación si corresponde.', case when t.id is not null then 'ticket' else 'payment' end, coalesce(t.id, pay.id), 'normal', pay.confirmed_by);
  elsif pay.purpose = 'order' then
    perform private.notify_superadmins(v_key, 'order.paid', 'Nuevo pedido pagado: ' || v_amount, 'Hay un pedido pagado por atender.', 'payment', pay.id, 'high', null);
  end if;
end $$;

-- «Aprobada» → el cliente debe elegir cómo pagar (si hay algo que cobrar). El resto igual a la migración 41.
create or replace function private.notify_ticket_staff(p_ticket uuid, p_type text, p_title text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype; v_q public.quotes%rowtype; v_key text; v_cust uuid; v_due boolean;
begin
  select * into t from public.tickets where id = p_ticket;
  if not found then return; end if;
  select * into v_q from public.quotes where ticket_id = p_ticket and status <> 'superseded' order by version desc limit 1;
  v_key := p_type || ':' || coalesce(v_q.id::text, t.id::text);
  v_cust := private.profile_of_customer(t.customer_id);
  v_due := coalesce(round(v_q.total, 0), 0) > 0;
  if p_type = 'quote.question' then
    -- El técnico responsable la responde; el SUPERADMIN también la conoce (seguimiento comercial). Sin técnico, el SUPERADMIN la atiende.
    if t.assigned_to is not null then
      perform private.notify(v_key, t.assigned_to, 'quote.question', p_title, 'Responde para que el cliente pueda decidir.', 'ticket', t.id, 'high', null);
      perform private.notify_superadmins(v_key, 'quote.question', p_title, 'El técnico asignado debe responderla; seguimiento comercial.', 'ticket', t.id, 'normal', null);
    else
      perform private.notify_superadmins(v_key, 'quote.question', p_title, 'Responde para que el cliente pueda decidir.', 'ticket', t.id, 'high', null);
    end if;
  elsif p_type = 'quote.approved' then
    perform private.notify(v_key, v_cust, 'quote.decision', '¡Cotización aprobada!',
      case when v_due then 'Elige cómo pagar (anticipo del 50 % o pago total con 5 % de descuento) para que podamos comenzar tu servicio.'
           else 'Gracias. Ya podemos continuar con tu servicio.' end, 'ticket', t.id, 'high', null);
    perform private.notify(v_key, t.assigned_to, 'quote.approved', p_title,
      case when v_due then 'Espera la confirmación del pago (anticipo o total) antes de iniciar la intervención.' else 'Ya puedes continuar con el servicio.' end,
      'ticket', t.id, 'high', null);
    perform private.notify_superadmins(v_key, 'quote.approved', p_title, 'Cotización aprobada: seguimiento administrativo y de cobro.', 'ticket', t.id, 'normal', null);
  elsif p_type = 'quote.rejected' then
    perform private.notify(v_key, v_cust, 'quote.decision', 'Registramos tu decisión', 'Recibimos tu respuesta: no continuarás con la reparación. Si cambias de opinión, escríbenos.', 'ticket', t.id, 'normal', null);
    perform private.notify(v_key, t.assigned_to, 'quote.rejected', p_title, 'El cliente no continuará con la reparación.', 'ticket', t.id, 'normal', null);
    perform private.notify_superadmins(v_key, 'quote.rejected', p_title, 'Cotización rechazada: revisa el cierre del servicio.', 'ticket', t.id, 'high', null);
  else
    perform private.notify(v_key, t.assigned_to, p_type, p_title, null, 'ticket', t.id, 'normal', null);
  end if;
end $$;

-- «Listo» con saldo pendiente: el aviso pide pagar el saldo antes de la entrega. El resto igual a la migración 41.
create or replace function private.notify_ticket_transition(t public.tickets, p_to public.ticket_status, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cust uuid := private.profile_of_customer(t.customer_id);
  v_key text := 'tr:' || t.id || ':' || p_to::text || ':' || (select count(*) from public.ticket_status_history where ticket_id = t.id and to_status = p_to);
  v_q uuid; m record;
begin
  if p_to = 'diagnosing' then
    perform private.notify(v_key, v_cust, 'diagnosis.started', 'Tu equipo está en diagnóstico', 'Un técnico lo está revisando para identificar la causa. No necesitas hacer nada por ahora.', 'ticket', t.id, 'normal', null);
    perform private.notify(v_key, t.assigned_to, 'task.diagnosis', 'Diagnóstico por completar: ' || t.code, 'Registra los hallazgos y finaliza el diagnóstico para preparar la propuesta.', 'ticket', t.id, 'normal', p_actor);
  elsif p_to = 'awaiting_part' then
    perform private.notify(v_key, v_cust, 'ticket.waiting_part', 'Estamos esperando un repuesto', 'Continuamos con tu reparación cuando llegue. Te avisaremos.', 'ticket', t.id, 'normal', null);
    perform private.notify_superadmins(v_key, 'ticket.blocked', 'Ticket en espera de repuesto: ' || t.code, 'La reparación está detenida hasta que llegue el repuesto.', 'ticket', t.id, 'high', p_actor);
  elsif p_to = 'in_service' then
    perform private.notify(v_key, v_cust, 'repair.started', 'Tu servicio quedó habilitado', 'Ya podemos trabajar en tu equipo; te avisaremos de los avances. No necesitas hacer nada por ahora.', 'ticket', t.id, 'normal', null);
  elsif p_to = 'ready' then
    select id into v_q from public.quotes where ticket_id = t.id and status = 'approved' order by version desc limit 1;
    if v_q is not null then select * into m from private.quote_money(v_q); end if;
    if v_q is not null and m.balance > 0 then
      perform private.notify(v_key, v_cust, 'ticket.ready', 'Tu equipo está listo', 'Para entregarlo, paga el saldo restante de $' || to_char(m.balance, 'FM999G999G999') || ' desde tu servicio.', 'ticket', t.id, 'high', null);
    else
      perform private.notify(v_key, v_cust, 'ticket.ready', 'Tu equipo está listo', 'Coordinemos la entrega. Ábrelo para ver cómo.', 'ticket', t.id, 'high', null);
    end if;
  elsif p_to = 'delivered' then
    perform private.notify(v_key, v_cust, 'ticket.delivered', 'Entrega confirmada', 'Gracias por confiar en TechnoUltra. Tus documentos y tu garantía están disponibles en tu servicio.', 'ticket', t.id, 'normal', null);
  elsif p_to = 'cancelled' then
    perform private.notify(v_key, v_cust, 'ticket.cancelled', 'Tu servicio fue cancelado', 'Si tienes dudas, escríbenos y lo revisamos contigo.', 'ticket', t.id, 'normal', null);
    perform private.notify(v_key, t.assigned_to, 'ticket.cancelled', 'Ticket cancelado: ' || t.code, 'El servicio fue cancelado.', 'ticket', t.id, 'normal', p_actor);
    perform private.notify_superadmins(v_key, 'ticket.cancelled', 'Ticket cancelado: ' || t.code, 'El servicio fue cancelado.', 'ticket', t.id, 'normal', p_actor);
  end if;
end $$;

-- ---------------------------------------------------------------- permisos
revoke execute on function private.quote_money(uuid), private.quote_installment(uuid, text) from public, anon, authenticated;
revoke execute on function public.begin_quote_payment(uuid, uuid, text), public.record_manual_quote_payment(uuid, uuid, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_quote_payment(uuid, uuid, text), public.record_manual_quote_payment(uuid, uuid, text, text, text, text, uuid) to service_role;
revoke execute on function public.quote_payment_summary(uuid) from public, anon;
grant execute on function public.quote_payment_summary(uuid) to authenticated, service_role;
