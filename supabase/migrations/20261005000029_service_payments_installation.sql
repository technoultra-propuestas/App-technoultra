-- PAGOS DE SERVICIOS · 29 · Diagnóstico y cotizaciones aprobadas se pagan igual que los pedidos: pago en línea (Mercado Pago) o pago manual
-- registrado por el SUPERADMIN. El monto SIEMPRE sale de la base de datos; el cliente solo indica QUÉ paga. Todo pago aprobado se
-- "liquida" por una única función (private.settle_payment), que además crea, de forma idempotente, el ticket de instalación de un pedido.

-- ---------------------------------------------------------------- estructura
alter table public.payments add column purpose text not null default 'order' check (purpose in ('order', 'quote', 'diagnosis'));
alter table public.payments add constraint payments_purpose_ref check (
  (purpose = 'order' and order_id is not null)
  or (purpose = 'quote' and quote_id is not null)
  or (purpose = 'diagnosis' and ticket_id is not null and quote_id is null and order_id is null));
-- Un solo pago activo (pendiente o aprobado) por cotización y por diagnóstico: evita cobros duplicados incluso con peticiones simultáneas.
create unique index payments_one_active_quote on public.payments (quote_id) where purpose = 'quote' and status in ('pending', 'approved');
create unique index payments_one_active_diagnosis on public.payments (ticket_id) where purpose = 'diagnosis' and status in ('pending', 'approved');

alter table public.quotes add column paid_at timestamptz;
-- Un ticket puede nacer de un pedido (instalación): relación con el pedido y la línea, y dirección del servicio a domicilio.
alter table public.tickets
  add column address_id uuid references public.addresses (id) on delete restrict,
  add column order_id uuid references public.orders (id) on delete restrict,
  add column order_item_id uuid unique references public.order_items (id) on delete restrict;
create index tickets_order_idx on public.tickets (order_id) where order_id is not null;

-- ---------------------------------------------------------------- ticket de instalación (idempotente)
create function private.create_installation_tickets(p_order uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; it record; v_ticket uuid; v_products text; v_n int := 0;
begin
  select * into o from public.orders where id = p_order;
  if not found then return 0; end if;
  select string_agg(description, ', ' order by description) into v_products from public.order_items where order_id = p_order and product_id is not null;
  for it in select oi.id, oi.service_id, oi.description from public.order_items oi where oi.order_id = p_order and oi.service_id is not null order by oi.id loop
    if exists (select 1 from public.tickets where order_item_id = it.id) then continue; end if; -- ya existe: no se duplica
    insert into public.tickets (customer_id, service_id, modality, problem, order_id, order_item_id, address_id)
    values (o.customer_id, it.service_id, 'home',
            left('Instalación incluida en el pedido ' || o.code || ': ' || it.description || coalesce('. Productos del pedido: ' || v_products, ''), 2000),
            o.id, it.id, o.address_id)
    on conflict (order_item_id) do nothing returning id into v_ticket;
    if v_ticket is null then continue; end if;
    v_n := v_n + 1;
    perform private.write_audit(null, 'system', 'ticket.created_from_order', 'tickets', v_ticket::text, jsonb_build_object('order', o.id, 'order_item', it.id));
    insert into public.notifications (recipient_id, type, title, entity_type, entity_id)
    select pr.id, 'ticket.created', 'Nuevo ticket de instalación (pedido ' || o.code || ')', 'ticket', v_ticket
    from public.profiles pr where pr.role = 'superadmin' and pr.is_active;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------- liquidación única de un pago aprobado (idempotente)
create function private.settle_payment(p_payment uuid) returns void
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
  else
    -- diagnóstico pagado: queda un crédito abonable a la reparación (una sola vez, por pago)
    insert into public.diagnosis_credits (customer_id, ticket_id, payment_id, amount) values (pay.customer_id, pay.ticket_id, pay.id, pay.amount)
    on conflict (payment_id) do nothing;
    select id into v_quote from public.quotes where ticket_id = pay.ticket_id and status = 'draft';
    if v_quote is not null then perform private.recompute_quote(v_quote); end if;
    v_title := 'Diagnóstico pagado';
  end if;
  -- Los avisos se crean UNA sola vez por pago aunque la liquidación se reaplique (webhook repetido, conciliación…).
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

-- ---------------------------------------------------------------- webhook: eventos verificados (reemplaza la versión de pedidos)
create or replace function public.apply_payment_event(
  p_provider public.payment_provider, p_event_id text, p_event_type text, p_payload jsonb, p_signature_valid boolean,
  p_external_reference text, p_external_id text, p_status public.payment_status, p_amount numeric, p_currency text
) returns text
language plpgsql security definer set search_path = '' as $$
declare v_event bigint; pay public.payments%rowtype;
begin
  insert into public.payment_events (provider, provider_event_id, event_type, payload, signature_valid)
  values (p_provider, p_event_id, p_event_type, coalesce(p_payload, '{}'::jsonb), p_signature_valid)
  on conflict (provider, provider_event_id) do nothing returning id into v_event;
  if v_event is null then return 'duplicate'; end if;
  if not p_signature_valid then
    update public.payment_events set processing_error = 'invalid_signature', processed_at = now() where id = v_event;
    return 'invalid_signature';
  end if;
  select * into pay from public.payments where external_reference = p_external_reference and provider = p_provider for update;
  if not found then
    update public.payment_events set processing_error = 'unknown_payment', processed_at = now() where id = v_event;
    return 'unknown_payment';
  end if;
  update public.payment_events set payment_id = pay.id where id = v_event;
  if p_amount is distinct from pay.amount or upper(p_currency) is distinct from pay.currency then
    update public.payment_events set processing_error = 'amount_mismatch', processed_at = now() where id = v_event;
    perform private.write_audit(null, 'system', 'payment.amount_mismatch', 'payments', pay.id::text, jsonb_build_object('expected', pay.amount, 'received', p_amount));
    return 'amount_mismatch';
  end if;
  if pay.status = p_status then
    update public.payment_events set processed_at = now() where id = v_event;
    -- reintento de un pago ya aprobado: la liquidación es idempotente y se reaplica por si quedó a medias
    if p_status = 'approved' then perform private.settle_payment(pay.id); end if;
    return 'noop';
  end if;
  begin
    update public.payments set status = p_status, external_id = coalesce(p_external_id, external_id),
      approved_at = case when p_status = 'approved' then now() else approved_at end
    where id = pay.id;
  exception when others then
    update public.payment_events set processing_error = left(sqlerrm, 200), processed_at = now() where id = v_event;
    return 'ignored_transition';
  end;
  if p_status = 'approved' then perform private.settle_payment(pay.id); end if;
  perform private.write_audit(null, 'system', 'payment.' || p_status::text, 'payments', pay.id::text, jsonb_build_object('provider', p_provider, 'purpose', pay.purpose));
  update public.payment_events set processed_at = now() where id = v_event;
  return p_status::text;
end $$;

-- ---------------------------------------------------------------- pago manual de un pedido (ahora liquida con la función común)
create or replace function public.record_manual_payment(p_actor uuid, p_order uuid, p_method text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; v_pay uuid;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'superadmin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_method not in ('cash', 'bank_transfer', 'cash_on_delivery', 'other') then raise exception 'invalid_method' using errcode = '22023'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or o.paid_at is not null or o.status <> 'new' then raise exception 'order_not_payable' using errcode = 'P0001'; end if;
  update public.payments set status = 'cancelled' where order_id = o.id and status = 'pending';
  insert into public.payments (customer_id, order_id, provider, method, status, amount, approved_at, confirmed_by)
  values (o.customer_id, o.id, 'manual', p_method, 'approved', o.total, now(), p_actor) returning id into v_pay;
  perform private.settle_payment(v_pay);
  perform private.write_audit(p_actor, 'superadmin', 'payment.manual_confirmed', 'payments', v_pay::text, jsonb_build_object('method', p_method, 'amount', o.total));
  return v_pay;
end $$;

-- ---------------------------------------------------------------- pagos de diagnóstico / cotización
-- Importe y estado SIEMPRE desde la base de datos. Devuelve el pago pendiente (reutiliza el vigente: idempotente).
create function private.service_amount(p_kind text, p_ref uuid, out v_customer uuid, out v_amount numeric, out v_title text, out v_ticket uuid)
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype; q public.quotes%rowtype;
begin
  if p_kind = 'diagnosis' then
    select * into t from public.tickets where id = p_ref;
    if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
    if t.status in ('cancelled', 'delivered') then raise exception 'ticket_closed' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.services where id = t.service_id and is_diagnostic_fee) then raise exception 'ticket_not_diagnosis' using errcode = 'P0001'; end if;
    if exists (select 1 from public.diagnosis_credits where ticket_id = t.id) then raise exception 'diagnosis_already_paid' using errcode = 'P0001'; end if;
    v_amount := coalesce((t.service_snapshot ->> 'base_price')::numeric, (select base_price from public.services where id = t.service_id));
    if v_amount is null or v_amount <= 0 then raise exception 'diagnosis_price_unavailable' using errcode = 'P0001'; end if;
    v_customer := t.customer_id; v_ticket := t.id; v_title := 'Diagnóstico · ' || t.code;
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

create function public.begin_service_payment(p_actor uuid, p_kind text, p_ref uuid)
returns table (payment_id uuid, amount numeric, title text, external_reference text, ticket_id uuid)
language plpgsql security definer set search_path = '' as $$
declare s record; p public.payments%rowtype;
begin
  select * into s from private.service_amount(p_kind, p_ref);
  if not exists (select 1 from public.customers c where c.id = s.v_customer and c.profile_id = p_actor) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into p from public.payments pa
   where pa.purpose = p_kind and pa.status = 'pending' and pa.provider = 'mercadopago'
     and ((p_kind = 'quote' and pa.quote_id = p_ref) or (p_kind = 'diagnosis' and pa.ticket_id = p_ref)) limit 1;
  if found and p.amount is distinct from s.v_amount then
    update public.payments set status = 'cancelled' where id = p.id; -- el importe cambió: se descarta el pendiente y se crea otro
    p := null;
  end if;
  if p.id is null then
    insert into public.payments (customer_id, quote_id, ticket_id, purpose, provider, status, amount)
    values (s.v_customer, case when p_kind = 'quote' then p_ref end, case when p_kind = 'diagnosis' then p_ref else s.v_ticket end, p_kind, 'mercadopago', 'pending', s.v_amount)
    returning * into p;
    update public.payments set external_reference = 'pay-' || p.id::text where id = p.id returning * into p;
  end if;
  return query select p.id, p.amount, s.v_title, p.external_reference, s.v_ticket;
end $$;

create function public.record_manual_service_payment(p_actor uuid, p_kind text, p_ref uuid, p_method text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s record; v_pay uuid;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'superadmin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_method not in ('cash', 'bank_transfer', 'other') then raise exception 'invalid_method' using errcode = '22023'; end if;
  select * into s from private.service_amount(p_kind, p_ref);
  -- el pago en línea pendiente (si lo hubiera) se anula: el cobro se registra una sola vez
  update public.payments set status = 'cancelled'
   where purpose = p_kind and status = 'pending' and ((p_kind = 'quote' and quote_id = p_ref) or (p_kind = 'diagnosis' and ticket_id = p_ref));
  insert into public.payments (customer_id, quote_id, ticket_id, purpose, provider, method, status, amount, approved_at, confirmed_by)
  values (s.v_customer, case when p_kind = 'quote' then p_ref end, case when p_kind = 'diagnosis' then p_ref else s.v_ticket end, p_kind, 'manual', p_method, 'approved', s.v_amount, now(), p_actor)
  returning id into v_pay;
  perform private.settle_payment(v_pay);
  perform private.write_audit(p_actor, 'superadmin', 'payment.manual_confirmed', 'payments', v_pay::text, jsonb_build_object('method', p_method, 'amount', s.v_amount, 'purpose', p_kind));
  return v_pay;
end $$;

-- Compatibilidad: el pago manual del diagnóstico ahora usa la función común.
create or replace function public.record_diagnosis_payment(p_actor uuid, p_ticket uuid, p_method text) returns uuid
language sql security definer set search_path = '' as $$
  select public.record_manual_service_payment(p_actor, 'diagnosis', p_ticket, p_method)
$$;

-- Los pagos en línea que nadie completó se vencen a las 48 horas (el cron del servidor lo ejecuta).
create function public.expire_pending_service_payments() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.payments set status = 'expired' where purpose in ('quote', 'diagnosis') and status = 'pending' and created_at < now() - interval '48 hours';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- domicilio de la cotización: también para tickets nacidos de un pedido
create or replace function public.set_quote_delivery(p_quote uuid, p_apply boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; v_role public.app_role := private.my_role(); t public.tickets%rowtype; a public.addresses%rowtype;
        v_fee numeric := 0; v_area public.coverage_areas%rowtype;
begin
  if v_role is null or v_role = 'client' or not private.can_manage_quote(p_quote) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if not found or q.status <> 'draft' then raise exception 'quote_not_editable' using errcode = '42501'; end if;
  if not p_apply then
    update public.quotes set delivery_fee = 0, delivery_snapshot = null where id = q.id;
  else
    if q.ticket_id is null then raise exception 'delivery_not_applicable' using errcode = 'P0001'; end if;
    select * into t from public.tickets where id = q.ticket_id;
    if t.modality not in ('home', 'pickup') then raise exception 'delivery_not_applicable' using errcode = 'P0001'; end if;
    select a2.* into a from public.addresses a2
     where a2.id = coalesce((select r.address_id from public.service_requests r where r.id = t.service_request_id), t.address_id);
    if not found then raise exception 'delivery_address_missing' using errcode = 'P0001'; end if;
    select * into v_area from public.coverage_areas where dane_code = a.dane_code and is_active;
    if not found then raise exception 'out_of_coverage' using errcode = 'P0001'; end if;
    v_fee := case when t.modality = 'home' then v_area.home_fee else v_area.pickup_fee end;
    update public.quotes set delivery_fee = v_fee, delivery_snapshot = jsonb_build_object(
        'dane_code', a.dane_code, 'city', v_area.city_name, 'modality', t.modality, 'fee', v_fee, 'captured_at', now())
     where id = q.id;
  end if;
  perform private.recompute_quote(q.id);
  perform private.write_audit(auth.uid(), v_role::text, 'quote.delivery_set', 'quotes', q.id::text, jsonb_build_object('apply', p_apply, 'fee', v_fee));
end $$;

-- ---------------------------------------------------------------- privilegios (solo servidor)
revoke execute on function public.begin_service_payment(uuid, text, uuid), public.record_manual_service_payment(uuid, text, uuid, text),
  public.expire_pending_service_payments() from public, anon, authenticated;
grant execute on function public.begin_service_payment(uuid, text, uuid), public.record_manual_service_payment(uuid, text, uuid, text),
  public.expire_pending_service_payments() to service_role;
revoke execute on function private.create_installation_tickets(uuid), private.settle_payment(uuid), private.service_amount(text, uuid) from public, anon, authenticated;
