-- FLUJO DEL CLIENTE · 30 · El ticket nace solo y los servicios de precio fijo se pagan al solicitarlos.
--  · La configuración del flujo vive en la base de datos (administrable), no en componentes.
--  · `auto_create_ticket` convierte una solicitud válida en ticket «Recibido» (idempotente) sin esperar a un SUPERADMIN.
--  · Pago inmediato de un servicio de precio fijo: nuevo propósito de pago `service` (importe SIEMPRE desde la base de datos).
-- Crear el ticket NO inicia diagnóstico, no aprueba nada, no toca inventario ni cambia estados técnicos.

-- ---------------------------------------------------------------- configuración del flujo por servicio
alter table public.services
  add column allow_online_payment boolean not null default true,
  add column flow_override text check (flow_override in ('immediate', 'quote'));
comment on column public.services.flow_override is 'NULL = automático (precio fijo sin cotización ni diagnóstico previo → pago inmediato). immediate/quote fuerzan el flujo.';
comment on column public.services.allow_online_payment is 'false = el servicio no ofrece pago en línea (se paga en el local y lo registra el SUPERADMIN).';

-- Flujo de un servicio para una modalidad: 'immediate' (paga ahora) o 'quote' (diagnóstico/cotización antes de cobrar).
-- Solo las modalidades sin desplazamiento (local y remoto) pueden pagarse de inmediato: el domicilio/recogida lleva una tarifa de
-- cobertura que se fija en la cotización.
create function public.service_flow(p_service uuid, p_modality public.service_modality) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when s.kind <> 'technical' then 'quote'
    when p_modality not in ('store', 'remote') then 'quote'
    when s.base_price is null or s.base_price <= 0 then 'quote'
    when s.flow_override = 'quote' then 'quote'
    when s.flow_override = 'immediate' then 'immediate'
    when s.price_mode = 'fixed' and not s.requires_quote and not s.requires_diagnosis then 'immediate'
    else 'quote'
  end
  from public.services s where s.id = p_service and s.is_active and s.deleted_at is null
$$;
revoke execute on function public.service_flow(uuid, public.service_modality) from public, anon;
grant execute on function public.service_flow(uuid, public.service_modality) to authenticated, service_role;

-- ---------------------------------------------------------------- pago de un servicio de precio fijo
alter table public.payments drop constraint payments_purpose_check;
alter table public.payments add constraint payments_purpose_check check (purpose in ('order', 'quote', 'diagnosis', 'service'));
alter table public.payments drop constraint payments_purpose_ref;
alter table public.payments add constraint payments_purpose_ref check (
  (purpose = 'order' and order_id is not null)
  or (purpose = 'quote' and quote_id is not null)
  or (purpose in ('diagnosis', 'service') and ticket_id is not null and quote_id is null and order_id is null));
create unique index payments_one_active_service on public.payments (ticket_id) where purpose = 'service' and status in ('pending', 'approved');

alter table public.tickets add column prepaid_at timestamptz, add column prepaid_amount numeric(12, 2);

-- ---------------------------------------------------------------- importe del cobro (base de datos manda)
create or replace function private.service_amount(p_kind text, p_ref uuid, out v_customer uuid, out v_amount numeric, out v_title text, out v_ticket uuid)
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype; q public.quotes%rowtype; s public.services%rowtype;
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
      -- servicio de precio fijo: solo si su flujo es de pago inmediato, no es diagnóstico (ese tiene su propio crédito) y admite pago en línea
      if coalesce(s.is_diagnostic_fee, false) then raise exception 'ticket_is_diagnosis' using errcode = 'P0001'; end if;
      if coalesce(public.service_flow(t.service_id, t.modality), 'quote') <> 'immediate' or not s.allow_online_payment then raise exception 'service_not_payable' using errcode = 'P0001'; end if;
      if t.prepaid_at is not null then raise exception 'service_already_paid' using errcode = 'P0001'; end if;
      v_title := left(coalesce(s.name, 'Servicio'), 60) || ' · ' || t.code;
    end if;
    v_amount := coalesce((t.service_snapshot ->> 'base_price')::numeric, s.base_price);
    if v_amount is null or v_amount <= 0 then raise exception 'price_unavailable' using errcode = 'P0001'; end if;
    v_customer := t.customer_id; v_ticket := t.id;
  elsif p_kind = 'quote' then
    select * into q from public.quotes where id = p_ref;
    if not found then raise exception 'quote_not_found' using errcode = 'P0002'; end if;
    if q.status <> 'approved' then raise exception 'quote_not_payable' using errcode = 'P0001'; end if;
    if q.paid_at is not null then raise exception 'quote_already_paid' using errcode = 'P0001'; end if;
    if q.total <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;
    v_amount := q.total; v_customer := q.customer_id; v_ticket := q.ticket_id; v_title := 'Cotización · ' || q.code;
  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
end $$;

create or replace function public.begin_service_payment(p_actor uuid, p_kind text, p_ref uuid)
returns table (payment_id uuid, amount numeric, title text, external_reference text, ticket_id uuid)
language plpgsql security definer set search_path = '' as $$
declare s record; p public.payments%rowtype;
begin
  select * into s from private.service_amount(p_kind, p_ref);
  if not exists (select 1 from public.customers c where c.id = s.v_customer and c.profile_id = p_actor) then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Serializa los intentos simultáneos (doble clic) sobre el mismo recurso.
  perform pg_advisory_xact_lock(hashtextextended(p_kind || ':' || p_ref::text, 0));
  select * into p from public.payments pa
   where pa.purpose = p_kind and pa.status = 'pending' and pa.provider = 'mercadopago'
     and ((p_kind = 'quote' and pa.quote_id = p_ref) or (p_kind in ('diagnosis', 'service') and pa.ticket_id = p_ref)) limit 1;
  if found and p.amount is distinct from s.v_amount then
    update public.payments set status = 'cancelled' where id = p.id; -- el importe cambió: se descarta el pendiente y se crea otro
    p := null;
  end if;
  if p.id is null then
    insert into public.payments (customer_id, quote_id, ticket_id, purpose, provider, status, amount)
    values (s.v_customer, case when p_kind = 'quote' then p_ref end, case when p_kind in ('diagnosis', 'service') then p_ref else s.v_ticket end, p_kind, 'mercadopago', 'pending', s.v_amount)
    returning * into p;
    update public.payments set external_reference = 'pay-' || p.id::text where id = p.id returning * into p;
  end if;
  return query select p.id, p.amount, s.v_title, p.external_reference, s.v_ticket;
end $$;

create or replace function public.record_manual_service_payment(p_actor uuid, p_kind text, p_ref uuid, p_method text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s record; v_pay uuid;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'superadmin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_method not in ('cash', 'bank_transfer', 'other') then raise exception 'invalid_method' using errcode = '22023'; end if;
  select * into s from private.service_amount(p_kind, p_ref);
  update public.payments set status = 'cancelled'
   where purpose = p_kind and status = 'pending' and ((p_kind = 'quote' and quote_id = p_ref) or (p_kind in ('diagnosis', 'service') and ticket_id = p_ref));
  insert into public.payments (customer_id, quote_id, ticket_id, purpose, provider, method, status, amount, approved_at, confirmed_by)
  values (s.v_customer, case when p_kind = 'quote' then p_ref end, case when p_kind in ('diagnosis', 'service') then p_ref else s.v_ticket end, p_kind, 'manual', p_method, 'approved', s.v_amount, now(), p_actor)
  returning id into v_pay;
  perform private.settle_payment(v_pay);
  perform private.write_audit(p_actor, 'superadmin', 'payment.manual_confirmed', 'payments', v_pay::text, jsonb_build_object('method', p_method, 'amount', s.v_amount, 'purpose', p_kind));
  return v_pay;
end $$;

create or replace function public.expire_pending_service_payments() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.payments set status = 'expired' where purpose in ('quote', 'diagnosis', 'service') and status = 'pending' and created_at < now() - interval '48 hours';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- liquidación (agrega el servicio de precio fijo)
create or replace function private.settle_payment(p_payment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pay public.payments%rowtype; v_profile uuid; v_quote uuid; v_title text;
begin
  select * into pay from public.payments where id = p_payment;
  if not found or pay.status <> 'approved' then return; end if;
  select c.profile_id into v_profile from public.customers c where c.id = pay.customer_id;
  if pay.purpose = 'order' then
    update public.orders set paid_at = coalesce(paid_at, now()) where id = pay.order_id;
    perform private.create_installation_tickets(pay.order_id);
    v_title := 'Nuevo pedido pagado';
  elsif pay.purpose = 'quote' then
    update public.quotes set paid_at = coalesce(paid_at, now()) where id = pay.quote_id;
    v_title := 'Cotización pagada';
  elsif pay.purpose = 'service' then
    update public.tickets set prepaid_at = coalesce(prepaid_at, now()), prepaid_amount = coalesce(prepaid_amount, pay.amount) where id = pay.ticket_id;
    v_title := 'Servicio pagado';
  else
    insert into public.diagnosis_credits (customer_id, ticket_id, payment_id, amount) values (pay.customer_id, pay.ticket_id, pay.id, pay.amount)
    on conflict (payment_id) do nothing;
    select id into v_quote from public.quotes where ticket_id = pay.ticket_id and status = 'draft';
    if v_quote is not null then perform private.recompute_quote(v_quote); end if;
    v_title := 'Diagnóstico pagado';
  end if;
  if v_profile is not null and not exists (select 1 from public.notifications where recipient_id = v_profile and type = 'payment.approved' and entity_id = pay.id) then
    insert into public.notifications (recipient_id, type, title, entity_type, entity_id)
    values (v_profile, 'payment.approved', 'Recibimos tu pago', 'payment', pay.id);
  end if;
  insert into public.notifications (recipient_id, type, title, entity_type, entity_id)
  select pr.id, case pay.purpose when 'order' then 'order.paid' else 'payment.received' end, v_title, 'payment', pay.id
  from public.profiles pr
  where pr.role = 'superadmin' and pr.is_active
    and not exists (select 1 from public.notifications n where n.recipient_id = pr.id and n.entity_id = pay.id and n.type in ('order.paid', 'payment.received'));
end $$;

-- ---------------------------------------------------------------- ticket automático (idempotente; solo servidor)
-- Requisitos: la solicitud existe y está pendiente/agendada, es de un servicio técnico (los digitales nacen como proyecto y los
-- gestiona el SUPERADMIN). El ticket queda «Recibido» y SIN asignar; el SUPERADMIN lo ve de inmediato.
create function public.auto_create_ticket(p_request uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.service_requests%rowtype; v_ticket uuid; v_kind public.service_kind;
begin
  select * into r from public.service_requests where id = p_request for update;
  if not found then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  select id into v_ticket from public.tickets where service_request_id = r.id;
  if v_ticket is not null then return v_ticket; end if; -- ya existe: no se duplica
  if r.status not in ('pending', 'scheduled') then raise exception 'request_not_open' using errcode = 'P0001'; end if;
  select kind into v_kind from public.services where id = r.service_id;
  if v_kind is distinct from 'technical' then raise exception 'service_not_technical' using errcode = 'P0001'; end if;
  insert into public.tickets (customer_id, equipment_id, service_request_id, service_id, modality, problem, address_id)
  values (r.customer_id, r.equipment_id, r.id, r.service_id, r.modality, r.problem_description, r.address_id)
  on conflict (service_request_id) do nothing returning id into v_ticket;
  if v_ticket is null then select id into v_ticket from public.tickets where service_request_id = r.id; return v_ticket; end if;
  perform private.write_audit(null, 'system', 'ticket.auto_created', 'tickets', v_ticket::text, jsonb_build_object('request', r.id));
  insert into public.notifications (recipient_id, type, title, entity_type, entity_id)
  select pr.id, 'ticket.created', 'Nueva solicitud: ' || r.code, 'ticket', v_ticket
  from public.profiles pr where pr.role = 'superadmin' and pr.is_active;
  return v_ticket;
end $$;
revoke execute on function public.auto_create_ticket(uuid) from public, anon, authenticated;
grant execute on function public.auto_create_ticket(uuid) to service_role;
revoke execute on function public.begin_service_payment(uuid, text, uuid), public.record_manual_service_payment(uuid, text, uuid, text),
  public.expire_pending_service_payments() from public, anon, authenticated;
grant execute on function public.begin_service_payment(uuid, text, uuid), public.record_manual_service_payment(uuid, text, uuid, text),
  public.expire_pending_service_payments() to service_role;
revoke execute on function private.settle_payment(uuid), private.service_amount(text, uuid) from public, anon, authenticated;
