-- FASE 8/9 · 14 · Tienda y pagos: pedidos con precios y envío calculados en base de datos, stock reservado y pagos
-- confirmados únicamente desde el servidor tras verificar con el proveedor.

alter table public.orders add column needs_installation boolean not null default false;
alter table public.orders add column paid_at timestamptz;
alter table public.orders add column expires_at timestamptz;
create index orders_pending_idx on public.orders (expires_at) where status = 'new' and paid_at is null;
create index payments_status_idx on public.payments (status, created_at);

-- Estado del pedido y pago: solo funciones del propietario (los administradores avanzan el estado logístico por UPDATE de status).
create or replace function private.guard_order() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.subtotal, new.shipping_fee, new.total, new.customer_id, new.paid_at, new.code, new.needs_installation)
     is distinct from (old.subtotal, old.shipping_fee, old.total, old.customer_id, old.paid_at, old.code, old.needs_installation)
     and not private.is_privileged_session() then
    raise exception 'privileged_column' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not private.is_privileged_session() then
    -- el personal solo avanza el flujo logístico, y solo si el pedido está pagado (o es contraentrega confirmada por admin)
    if old.paid_at is null and new.status in ('preparing', 'shipped', 'delivered') then raise exception 'order_not_paid' using errcode = '42501'; end if;
    if old.status in ('delivered', 'cancelled') then raise exception 'order_final_state' using errcode = '42501'; end if;
  end if;
  return new;
end $$;
create trigger orders_guard before update on public.orders for each row execute function private.guard_order();

-- Disponibilidad pública SIN exponer cantidades exactas.
create function public.product_stock_flags() returns table (product_id uuid, in_stock boolean, low_stock boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(i.stock_on_hand, 0) > 0, coalesce(i.stock_on_hand, 0) between 1 and greatest(coalesce(i.reorder_level, 0), 3)
  from public.products p left join public.inventory i on i.product_id = p.id
  where p.is_active and p.deleted_at is null
$$;
grant execute on function public.product_stock_flags() to anon, authenticated, service_role;

-- Crea el pedido del cliente autenticado. NUNCA recibe precios ni totales: todo sale del catálogo y de la cobertura.
-- p_items: [{"product_id": uuid, "qty": int, "install": bool}]
create function public.create_order(p_items jsonb, p_delivery_method text, p_address_id uuid default null, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_cust uuid := private.my_customer_id(); v_order uuid; it jsonb; pr public.products%rowtype; v_qty int; v_install boolean;
  v_sub numeric(14, 2) := 0; v_ship numeric(12, 2) := 0; v_need_install boolean := false; v_svc public.services%rowtype;
  v_addr public.addresses%rowtype; v_stock int; v_hours int; v_n int := 0;
begin
  if v_cust is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_delivery_method not in ('pickup_store', 'delivery') then raise exception 'invalid_delivery_method' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'invalid_items' using errcode = '22023'; end if;

  if p_address_id is not null then
    select * into v_addr from public.addresses where id = p_address_id and customer_id = v_cust and deleted_at is null;
    if not found then raise exception 'address_not_owned' using errcode = '42501'; end if;
  end if;
  if p_delivery_method = 'delivery' then
    if p_address_id is null then raise exception 'address_required' using errcode = '23514'; end if;
    -- entrega solo donde hay cobertura configurada (regla de envío conservadora; configurable desde administración)
    if not public.check_coverage(v_addr.dane_code, 'home') then raise exception 'out_of_coverage' using errcode = 'P0001'; end if;
    select home_fee into v_ship from public.coverage_areas where dane_code = v_addr.dane_code and is_active;
  end if;

  select coalesce((select (value #>> '{}')::int from public.app_settings where key = 'orders.pending_hours'), 24) into v_hours;
  insert into public.orders (customer_id, delivery_method, address_id, notes, shipping_fee, expires_at)
  values (v_cust, p_delivery_method, p_address_id, left(p_notes, 500), coalesce(v_ship, 0), now() + make_interval(hours => v_hours))
  returning id into v_order;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it ->> 'qty')::int;
    v_install := coalesce((it ->> 'install')::boolean, false);
    if v_qty is null or v_qty not between 1 and 99 then raise exception 'invalid_qty' using errcode = '22023'; end if;
    select * into pr from public.products where id = (it ->> 'product_id')::uuid and is_active and deleted_at is null;
    if not found then raise exception 'product_unavailable' using errcode = '23514'; end if;
    -- reserva de stock (libro mayor inmutable): falla si no alcanza
    select stock_on_hand into v_stock from public.inventory where product_id = pr.id;
    if coalesce(v_stock, 0) < v_qty then raise exception 'insufficient_stock: %', pr.name using errcode = '23514'; end if;
    insert into public.inventory_movements (product_id, delta, reason, reference_type, reference_id, actor_id)
    values (pr.id, -v_qty, 'sale', 'order', v_order, auth.uid());
    v_n := v_n + 1;
    insert into public.order_items (order_id, product_id, description, qty, unit_price, warranty_days)
    values (v_order, pr.id, pr.name, v_qty, pr.price, pr.warranty_days);
    v_sub := v_sub + pr.price * v_qty;

    if v_install then
      select s.* into v_svc from public.product_service_links l join public.services s on s.id = l.service_id
      where l.product_id = pr.id and l.link_kind = 'installation' and s.is_active and s.deleted_at is null and s.price_mode <> 'quote' limit 1;
      if not found then raise exception 'installation_unavailable' using errcode = '23514'; end if;
      if p_address_id is null or not public.check_coverage(v_addr.dane_code, 'home') then raise exception 'out_of_coverage' using errcode = 'P0001'; end if;
      insert into public.order_items (order_id, service_id, description, qty, unit_price, warranty_days)
      values (v_order, v_svc.id, v_svc.name, v_qty, v_svc.base_price, v_svc.default_warranty_days);
      v_sub := v_sub + v_svc.base_price * v_qty;
      v_need_install := true;
    end if;
  end loop;

  update public.orders set subtotal = v_sub, total = v_sub + coalesce(v_ship, 0), needs_installation = v_need_install where id = v_order;
  perform private.write_audit(auth.uid(), 'client', 'order.created', 'orders', v_order::text, jsonb_build_object('lines', v_n, 'total', v_sub + coalesce(v_ship, 0)));
  return v_order;
end $$;

-- Devuelve el stock reservado (movimiento 'return') de un pedido.
create function private.release_order_stock(p_order uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.inventory_movements (product_id, delta, reason, reference_type, reference_id)
  select oi.product_id, oi.qty, 'return', 'order', p_order from public.order_items oi where oi.order_id = p_order and oi.product_id is not null
$$;

create function public.cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or (o.customer_id <> private.my_customer_id() and not private.is_admin()) then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if o.paid_at is not null or o.status <> 'new' then raise exception 'order_not_cancellable' using errcode = 'P0001'; end if;
  update public.orders set status = 'cancelled' where id = o.id;
  update public.payments set status = 'cancelled' where order_id = o.id and status = 'pending';
  perform private.release_order_stock(o.id);
  perform private.write_audit(auth.uid(), private.my_role()::text, 'order.cancelled', 'orders', o.id::text, '{}'::jsonb);
end $$;

-- Cron del servidor: cancela pedidos sin pago vencidos y libera su stock.
create function public.expire_pending_orders() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from public.orders where status = 'new' and paid_at is null and expires_at < now() for update skip locked loop
    update public.orders set status = 'cancelled' where id = r.id;
    update public.payments set status = 'expired' where order_id = r.id and status = 'pending';
    perform private.release_order_stock(r.id);
    perform private.write_audit(null, 'system', 'order.expired', 'orders', r.id::text, '{}'::jsonb);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Prepara el pago de un pedido (solo servidor). Reutiliza un pago pendiente vigente; el monto sale SIEMPRE del pedido.
create function public.begin_payment(p_order uuid, p_actor uuid) returns table (payment_id uuid, amount numeric, order_code text, external_reference text)
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; p public.payments%rowtype;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or not exists (select 1 from public.customers c where c.id = o.customer_id and c.profile_id = p_actor) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.status <> 'new' or o.paid_at is not null then raise exception 'order_not_payable' using errcode = 'P0001'; end if;
  if o.total <= 0 then raise exception 'order_empty' using errcode = 'P0001'; end if;
  if o.expires_at is not null and o.expires_at < now() then raise exception 'order_expired' using errcode = 'P0001'; end if;
  select * into p from public.payments where order_id = o.id and status = 'pending' and provider = 'mercadopago' order by created_at desc limit 1;
  if not found then
    insert into public.payments (customer_id, order_id, provider, status, amount)
    values (o.customer_id, o.id, 'mercadopago', 'pending', o.total) returning * into p;
    update public.payments set external_reference = 'pay-' || p.id::text where id = p.id returning * into p;
  end if;
  return query select p.id, p.amount, o.code, p.external_reference;
end $$;

-- Aplica un evento YA VERIFICADO por el servidor (firma + consulta al proveedor). Idempotente.
create function public.apply_payment_event(
  p_provider public.payment_provider, p_event_id text, p_event_type text, p_payload jsonb, p_signature_valid boolean,
  p_external_reference text, p_external_id text, p_status public.payment_status, p_amount numeric, p_currency text
) returns text
language plpgsql security definer set search_path = '' as $$
declare v_event bigint; pay public.payments%rowtype; v_cust_profile uuid;
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
  if p_status = 'approved' and pay.order_id is not null then
    update public.orders set paid_at = coalesce(paid_at, now()) where id = pay.order_id;
    select c.profile_id into v_cust_profile from public.customers c where c.id = pay.customer_id;
    if v_cust_profile is not null then
      insert into public.notifications (recipient_id, type, title, entity_type, entity_id)
      values (v_cust_profile, 'payment.approved', 'Recibimos tu pago', 'payment', pay.id);
    end if;
    insert into public.notifications (recipient_id, type, title, entity_type, entity_id)
    select pr.id, 'order.paid', 'Nuevo pedido pagado', 'payment', pay.id from public.profiles pr where pr.role = 'admin' and pr.is_active;
  end if;
  perform private.write_audit(null, 'system', 'payment.' || p_status::text, 'payments', pay.id::text, jsonb_build_object('provider', p_provider));
  update public.payment_events set processed_at = now() where id = v_event;
  return p_status::text;
end $$;

-- Pago manual (efectivo, transferencia): solo un administrador con permiso, y queda auditado.
create function public.record_manual_payment(p_actor uuid, p_order uuid, p_method text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; v_pay uuid;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_method not in ('cash', 'bank_transfer', 'cash_on_delivery', 'other') then raise exception 'invalid_method' using errcode = '22023'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or o.paid_at is not null or o.status <> 'new' then raise exception 'order_not_payable' using errcode = 'P0001'; end if;
  insert into public.payments (customer_id, order_id, provider, method, status, amount, approved_at, confirmed_by)
  values (o.customer_id, o.id, 'manual', p_method, 'approved', o.total, now(), p_actor) returning id into v_pay;
  update public.orders set paid_at = now() where id = o.id;
  perform private.write_audit(p_actor, 'admin', 'payment.manual_confirmed', 'payments', v_pay::text, jsonb_build_object('method', p_method, 'amount', o.total));
  return v_pay;
end $$;

revoke execute on function public.create_order(jsonb, text, uuid, text), public.cancel_order(uuid) from public, anon;
grant execute on function public.create_order(jsonb, text, uuid, text), public.cancel_order(uuid) to authenticated, service_role;
revoke execute on function public.expire_pending_orders(), public.begin_payment(uuid, uuid),
  public.apply_payment_event(public.payment_provider, text, text, jsonb, boolean, text, text, public.payment_status, numeric, text),
  public.record_manual_payment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.expire_pending_orders(), public.begin_payment(uuid, uuid),
  public.apply_payment_event(public.payment_provider, text, text, jsonb, boolean, text, text, public.payment_status, numeric, text),
  public.record_manual_payment(uuid, uuid, text) to service_role;

insert into public.app_settings (key, value, description) values
  ('orders.pending_hours', '24', 'Horas que se reserva el stock de un pedido sin pagar'),
  ('store.delivery_policy', '"coverage_only"', 'Entrega a domicilio solo en municipios con cobertura; fuera de cobertura: recoger en tienda')
on conflict (key) do nothing;
