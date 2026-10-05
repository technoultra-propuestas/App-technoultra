-- CONFIGURACIÓN COMERCIAL · 22 · IVA configurable, recargo por urgencia, domicilio, crédito de diagnóstico y snapshots.
-- Todo vive en la base de datos y se administra desde el CRM (/b/comercial, /b/cobertura); nada está fijo en el código.
-- Regla fiscal: el precio publicado/ingresado es SIEMPRE el precio final al cliente. Hoy TechnoUltra no es responsable de IVA:
-- no se agrega ni se muestra. Si lo fuera, el IVA se DESGLOSA del total (informativo), nunca se suma encima.

-- ---------------------------------------------------------------- IVA (configuración auditada)
insert into public.app_settings (key, value, description, is_public) values
  ('tax.vat_responsible', 'false', 'TechnoUltra es responsable de IVA. Mientras sea false no se calcula ni se muestra IVA.', true),
  ('tax.vat_rate', '19', 'Tarifa de IVA en %, solo se usa si es responsable de IVA.', true),
  ('tax.prices_include_vat', 'true', 'Los precios publicados son el precio FINAL al cliente (IVA incluido).', true)
on conflict (key) do nothing;

create function private.validate_tax_setting() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.key in ('tax.vat_responsible', 'tax.prices_include_vat') and jsonb_typeof(new.value) <> 'boolean' then
    raise exception 'invalid_setting_value' using errcode = '22023';
  end if;
  if new.key = 'tax.vat_rate' and (jsonb_typeof(new.value) <> 'number' or (new.value #>> '{}')::numeric not between 0 and 100) then
    raise exception 'invalid_setting_value' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger app_settings_validate_tax before insert or update on public.app_settings
  for each row execute function private.validate_tax_setting();

create function private.tax_config(out responsible boolean, out rate numeric)
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'tax.vat_responsible'), false),
         coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'tax.vat_rate'), 19)
$$;
grant execute on function private.tax_config() to authenticated, service_role;

-- ---------------------------------------------------------------- recargo por urgencia (niveles configurables)
create table public.urgency_levels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]{3,30}$'),
  label text not null check (char_length(btrim(label)) between 3 and 60),
  sort_order int not null default 0,
  percent numeric(5, 2) not null default 0 check (percent between 0 and 300),
  fixed_amount numeric(12, 2) not null default 0 check (fixed_amount >= 0),
  min_amount numeric(12, 2) not null default 0 check (min_amount >= 0),
  days smallint[] not null default '{1,2,3,4,5,6,7}' check (days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] and cardinality(days) >= 1),
  start_time time,
  end_time time,
  modalities public.service_modality[] not null default '{store,pickup,home,remote}' check (cardinality(modalities) >= 1),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((start_time is null) = (end_time is null))
);
create trigger urgency_levels_updated before update on public.urgency_levels for each row execute function private.set_updated_at();
-- Servicios a los que aplica; sin filas = aplica a todos los servicios de la cotización.
create table public.urgency_level_services (
  level_id uuid not null references public.urgency_levels (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (level_id, service_id)
);
-- Niveles iniciales. Normal no tiene recargo; los demás quedan INACTIVOS con 0 % hasta que administración defina el valor.
insert into public.urgency_levels (code, label, sort_order, is_active) values
  ('normal', 'Normal', 1, true),
  ('prioritaria', 'Prioritaria', 2, false),
  ('urgente', 'Urgente', 3, false),
  ('emergencia', 'Emergencia / fuera de horario', 4, false);

-- ---------------------------------------------------------------- diagnóstico: bandera + libro de créditos
alter table public.services add column is_diagnostic_fee boolean not null default false;

create table public.diagnosis_credits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  ticket_id uuid not null references public.tickets (id) on delete restrict,
  payment_id uuid not null unique references public.payments (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  status text not null default 'available' check (status in ('available', 'applied', 'void')),
  applied_quote_id uuid references public.quotes (id) on delete restrict,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'applied') = (applied_quote_id is not null))
);
create index diagnosis_credits_ticket_idx on public.diagnosis_credits (ticket_id);
-- Un crédito aplicado no vuelve atrás ni cambia de monto: no se puede usar dos veces.
create function private.diagnosis_credit_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.amount, new.payment_id, new.ticket_id, new.customer_id) is distinct from (old.amount, old.payment_id, old.ticket_id, old.customer_id) then
    raise exception 'diagnosis_credit_immutable' using errcode = '42501';
  end if;
  if old.status <> 'available' and new.status is distinct from old.status then
    raise exception 'diagnosis_credit_final' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger diagnosis_credits_guard before update on public.diagnosis_credits for each row execute function private.diagnosis_credit_guard();

-- ---------------------------------------------------------------- snapshots comerciales
alter table public.quotes
  add column urgency_level_id uuid references public.urgency_levels (id) on delete restrict,
  add column urgency_snapshot jsonb,
  add column urgency_amount numeric(14, 2) not null default 0 check (urgency_amount >= 0),
  add column delivery_fee numeric(14, 2) not null default 0 check (delivery_fee >= 0),
  add column delivery_snapshot jsonb,
  add column diagnosis_credit_id uuid references public.diagnosis_credits (id) on delete restrict,
  add column diagnosis_credit numeric(14, 2) not null default 0 check (diagnosis_credit >= 0),
  add column tax_snapshot jsonb,
  add column vat_included numeric(14, 2) not null default 0 check (vat_included >= 0);
alter table public.orders add column pricing_snapshot jsonb;
alter table public.payments add column pricing_snapshot jsonb;

create function private.stamp_pricing_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t record; v jsonb;
begin
  select * into t from private.tax_config();
  if tg_table_name = 'orders' then
    v := jsonb_build_object('shipping_fee', new.shipping_fee, 'subtotal', new.subtotal);
  else
    v := jsonb_build_object('amount', new.amount, 'order_id', new.order_id, 'quote_id', new.quote_id, 'ticket_id', new.ticket_id);
  end if;
  new.pricing_snapshot := v || jsonb_build_object('tax', jsonb_build_object('responsible', t.responsible, 'rate', case when t.responsible then t.rate else 0 end, 'included', true), 'captured_at', now());
  return new;
end $$;
create trigger orders_pricing_snapshot before insert on public.orders for each row execute function private.stamp_pricing_snapshot();
create trigger payments_pricing_snapshot before insert on public.payments for each row execute function private.stamp_pricing_snapshot();

-- ---------------------------------------------------------------- cálculo único de totales de cotización
-- total = ítems + recargo por urgencia + domicilio − crédito de diagnóstico. El IVA nunca se suma: si es responsable se desglosa.
create function private.recompute_quote(p_quote uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype; v_sub numeric := 0; v_gross numeric := 0; v_disc numeric := 0; v_tax numeric := 0;
  v_urg numeric := 0; v_base numeric := 0; v_snap jsonb; v_ids uuid[]; v_nondiag numeric := 0;
  v_cid uuid; v_cav numeric; v_credit numeric := 0; v_total numeric; v_cfg record; v_vat numeric := 0; v_taxsnap jsonb;
begin
  select * into q from public.quotes where id = p_quote;
  if not found or q.status <> 'draft' then return; end if;
  select coalesce(sum(line_subtotal), 0), coalesce(sum(line_subtotal + discount), 0), coalesce(sum(discount), 0), coalesce(sum(line_tax), 0)
    into v_sub, v_gross, v_disc, v_tax from public.quote_items where quote_id = p_quote;

  -- recargo por urgencia sobre los servicios (todos o los configurados), con los valores CONGELADOS al elegir el nivel
  v_snap := q.urgency_snapshot;
  if v_snap is not null then
    select array(select (jsonb_array_elements_text(v_snap -> 'service_ids'))::uuid) into v_ids;
    select coalesce(sum(i.line_subtotal), 0) into v_base from public.quote_items i
     where i.quote_id = p_quote and i.kind = 'service' and (cardinality(v_ids) = 0 or i.service_id = any (v_ids));
    if v_base > 0 then
      v_urg := round(v_base * (v_snap ->> 'percent')::numeric / 100, 2) + (v_snap ->> 'fixed_amount')::numeric;
      if v_urg > 0 then v_urg := greatest(v_urg, (v_snap ->> 'min_amount')::numeric); end if;
    end if;
  end if;

  -- crédito de diagnóstico: se descuenta de lo que NO es el propio diagnóstico (+ recargos y domicilio)
  if q.ticket_id is not null then
    select coalesce(sum(i.line_subtotal), 0) into v_nondiag from public.quote_items i
      left join public.services s on s.id = i.service_id
     where i.quote_id = p_quote and not coalesce(s.is_diagnostic_fee, false);
    select c.id, c.amount into v_cid, v_cav from public.diagnosis_credits c
     where c.ticket_id = q.ticket_id and c.status = 'available' order by c.created_at limit 1;
    if v_cid is not null and v_nondiag > 0 then v_credit := least(v_cav, v_nondiag + v_urg + q.delivery_fee); else v_cid := null; end if;
  end if;

  v_total := v_sub + v_tax + v_urg + q.delivery_fee - v_credit;
  select * into v_cfg from private.tax_config();
  if v_cfg.responsible then
    v_vat := round(v_total * v_cfg.rate / (100 + v_cfg.rate), 2);
    v_taxsnap := jsonb_build_object('responsible', true, 'rate', v_cfg.rate, 'included', true, 'base', v_total - v_vat, 'vat', v_vat);
  else
    v_taxsnap := jsonb_build_object('responsible', false, 'rate', 0, 'included', true);
  end if;
  update public.quotes set subtotal = v_gross, discount_total = v_disc, tax_total = v_tax, urgency_amount = v_urg,
         diagnosis_credit_id = v_cid, diagnosis_credit = v_credit, total = v_total, vat_included = v_vat, tax_snapshot = v_taxsnap
   where id = p_quote;
end $$;

create or replace function private.recalc_quote() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.recompute_quote(coalesce(new.quote_id, old.quote_id));
  return null;
end $$;

-- El precio ingresado es el FINAL: nunca se suma IVA por línea. Se conserva el piso de los precios "Desde" (migración 20).
create or replace function private.quote_item_before() returns trigger
language plpgsql set search_path = '' as $$
declare v_cat numeric; v_mode public.price_mode; v_qid uuid := coalesce(new.quote_id, old.quote_id);
begin
  if private.quote_status_of(v_qid) is distinct from 'draft' and not private.is_privileged_session() then
    raise exception 'quote_not_editable' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.tax_rate := 0;
  if new.kind in ('service', 'product') then
    select c.price, c.mode into v_cat, v_mode from private.catalog_price(new.kind, coalesce(new.service_id, new.product_id)) c;
    if v_mode <> 'quote' then
      if new.unit_price is null then
        new.unit_price := v_cat;
      elsif new.unit_price <> v_cat and not (private.is_privileged_session() or private.has_permission('pricing.override') or (v_mode = 'from' and new.unit_price >= v_cat)) then
        raise exception 'price_override_forbidden' using errcode = '42501';
      end if;
    end if;
  end if;
  if new.unit_price is null then raise exception 'price_required' using errcode = '23502'; end if;
  return new;
end $$;

-- ---------------------------------------------------------------- personal: urgencia y domicilio en la cotización
create function public.set_quote_urgency(p_quote uuid, p_level uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; u public.urgency_levels%rowtype; v_role public.app_role := private.my_role(); v_mod public.service_modality;
        v_local timestamp := now() at time zone 'America/Bogota'; v_t time; v_ok boolean := true;
begin
  if v_role is null or v_role = 'client' or not private.can_manage_quote(p_quote) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if not found or q.status <> 'draft' then raise exception 'quote_not_editable' using errcode = '42501'; end if;
  if p_level is null then
    update public.quotes set urgency_level_id = null, urgency_snapshot = null where id = q.id;
  else
    select * into u from public.urgency_levels where id = p_level and is_active;
    if not found then raise exception 'urgency_unavailable' using errcode = 'P0001'; end if;
    if q.ticket_id is not null then
      select modality into v_mod from public.tickets where id = q.ticket_id;
      if not (v_mod = any (u.modalities)) then raise exception 'urgency_not_applicable' using errcode = 'P0001'; end if;
    end if;
    v_t := v_local::time;
    if not (extract(isodow from v_local)::smallint = any (u.days)) then v_ok := false; end if;
    if v_ok and u.start_time is not null then
      v_ok := case when u.start_time <= u.end_time then v_t between u.start_time and u.end_time else (v_t >= u.start_time or v_t <= u.end_time) end;
    end if;
    if not v_ok then raise exception 'urgency_not_applicable' using errcode = 'P0001'; end if;
    update public.quotes set urgency_level_id = u.id, urgency_snapshot = jsonb_build_object(
        'level_id', u.id, 'code', u.code, 'label', u.label, 'percent', u.percent, 'fixed_amount', u.fixed_amount, 'min_amount', u.min_amount,
        'service_ids', coalesce((select jsonb_agg(s.service_id) from public.urgency_level_services s where s.level_id = u.id), '[]'::jsonb),
        'captured_at', now())
     where id = q.id;
  end if;
  perform private.recompute_quote(q.id);
  perform private.write_audit(auth.uid(), v_role::text, 'quote.urgency_set', 'quotes', q.id::text, jsonb_build_object('level', p_level));
end $$;

-- Domicilio: concepto independiente del servicio. La tarifa sale de la cobertura del municipio de la dirección de la solicitud.
create function public.set_quote_delivery(p_quote uuid, p_apply boolean) returns void
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
    select a2.* into a from public.service_requests r join public.addresses a2 on a2.id = r.address_id where r.id = t.service_request_id;
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

-- ---------------------------------------------------------------- pago del diagnóstico y crédito (uso exclusivo del servidor)
create function public.record_diagnosis_payment(p_actor uuid, p_ticket uuid, p_method text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype; v_amount numeric; v_pay uuid; v_credit uuid; v_quote uuid;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_method not in ('cash', 'bank_transfer', 'other') then raise exception 'invalid_method' using errcode = '22023'; end if;
  select * into t from public.tickets where id = p_ticket for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.services where id = t.service_id and is_diagnostic_fee) then raise exception 'ticket_not_diagnosis' using errcode = 'P0001'; end if;
  if exists (select 1 from public.diagnosis_credits where ticket_id = p_ticket) then raise exception 'diagnosis_already_paid' using errcode = 'P0001'; end if;
  -- el valor sale del snapshot del servicio al crear el ticket (el servidor decide el monto; los cambios de catálogo no lo alteran)
  v_amount := coalesce((t.service_snapshot ->> 'base_price')::numeric, (select base_price from public.services where id = t.service_id));
  if v_amount is null or v_amount <= 0 then raise exception 'diagnosis_price_unavailable' using errcode = 'P0001'; end if;
  insert into public.payments (customer_id, ticket_id, provider, method, status, amount, approved_at, confirmed_by)
  values (t.customer_id, t.id, 'manual', p_method, 'approved', v_amount, now(), p_actor) returning id into v_pay;
  insert into public.diagnosis_credits (customer_id, ticket_id, payment_id, amount) values (t.customer_id, t.id, v_pay, v_amount) returning id into v_credit;
  perform private.write_audit(p_actor, 'admin', 'diagnosis.paid', 'diagnosis_credits', v_credit::text, jsonb_build_object('amount', v_amount, 'method', p_method));
  select id into v_quote from public.quotes where ticket_id = t.id and status = 'draft';
  if v_quote is not null then perform private.recompute_quote(v_quote); end if;
  return v_pay;
end $$;

-- El crédito se consume al APROBAR la cotización (una sola vez). Si no se aprueba, el diagnóstico queda cobrado sin abono.
create function private.consume_diagnosis_credit(p_quote uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; n int;
begin
  select * into q from public.quotes where id = p_quote;
  if q.diagnosis_credit_id is null or q.diagnosis_credit <= 0 then return; end if;
  update public.diagnosis_credits set status = 'applied', applied_quote_id = q.id, applied_at = now()
   where id = q.diagnosis_credit_id and status = 'available';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'diagnosis_credit_already_used' using errcode = 'P0001'; end if;
  perform private.write_audit(auth.uid(), private.my_role()::text, 'diagnosis.credit_applied', 'diagnosis_credits', q.diagnosis_credit_id::text,
    jsonb_build_object('quote', q.id, 'amount', q.diagnosis_credit));
end $$;

create or replace function public.decide_quote(p_quote uuid, p_decision text, p_message text default null) returns void
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
    perform private.consume_diagnosis_credit(q.id);
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
  if q.ticket_id is not null then
    perform private.apply_transition(q.ticket_id, case when q.needs_part then 'awaiting_part' else 'in_service' end::public.ticket_status,
      auth.uid(), v_role::text, 'Aprobación presencial', false);
  end if;
end $$;

-- Una versión nueva conserva urgencia y domicilio (con sus valores congelados); el crédito vuelve a calcularse solo.
create or replace function public.revise_quote(p_quote uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; v_new uuid; v_role public.app_role := private.my_role(); v_ticket_status public.ticket_status;
begin
  if v_role is null or v_role = 'client' or not private.can_manage_quote(p_quote) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if q.status not in ('sent', 'clarification', 'expired') then raise exception 'quote_not_revisable' using errcode = 'P0001'; end if;
  update public.quotes set status = 'superseded' where id = q.id;
  insert into public.quotes (ticket_id, project_id, customer_id, version, supersedes_id, notes, terms, needs_part, created_by,
                             urgency_level_id, urgency_snapshot, delivery_fee, delivery_snapshot)
  values (q.ticket_id, q.project_id, q.customer_id, q.version + 1, q.id, q.notes, q.terms, q.needs_part, auth.uid(),
          q.urgency_level_id, q.urgency_snapshot, q.delivery_fee, q.delivery_snapshot)
  returning id into v_new;
  insert into public.quote_items (quote_id, position, kind, service_id, product_id, description, qty, unit_price, discount, tax_rate, warranty_days, warranty_kind, service_snapshot)
  select v_new, position, kind, service_id, product_id, description, qty, unit_price, discount, tax_rate, warranty_days, warranty_kind, service_snapshot
  from public.quote_items where quote_id = q.id;
  perform private.recompute_quote(v_new);
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

-- ---------------------------------------------------------------- datos iniciales dictados por el negocio (editables en el CRM)
-- Domicilio: Cali $15.000, resto de municipios con cobertura $25.000. La recogida no se definió: queda como estaba.
update public.coverage_areas set home_fee = case when dane_code = '76001' then 15000 else 25000 end;
-- Todos los diagnósticos son abonables a la reparación si el cliente la aprueba.
update public.services set is_diagnostic_fee = true where kind = 'technical' and name like 'Diagnóstico%' and price_mode = 'fixed';

-- ---------------------------------------------------------------- privilegios y RLS
revoke execute on function public.set_quote_urgency(uuid, uuid), public.set_quote_delivery(uuid, boolean) from public, anon;
grant execute on function public.set_quote_urgency(uuid, uuid), public.set_quote_delivery(uuid, boolean) to authenticated, service_role;
revoke execute on function public.record_diagnosis_payment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_diagnosis_payment(uuid, uuid, text) to service_role;

alter table public.urgency_levels enable row level security;
alter table public.urgency_level_services enable row level security;
alter table public.diagnosis_credits enable row level security;

create policy urgency_levels_read on public.urgency_levels for select to authenticated
  using (is_active or (select private.has_permission('catalog.manage')));
create policy urgency_levels_admin_write on public.urgency_levels for all to authenticated
  using ((select private.has_permission('catalog.manage'))) with check ((select private.has_permission('catalog.manage')));
create policy urgency_services_read on public.urgency_level_services for select to authenticated
  using ((select private.my_role()) is not null);
create policy urgency_services_admin_write on public.urgency_level_services for all to authenticated
  using ((select private.has_permission('catalog.manage'))) with check ((select private.has_permission('catalog.manage')));
create policy diagnosis_credits_read on public.diagnosis_credits for select to authenticated
  using (customer_id = (select private.my_customer_id()) or (select private.is_admin()));

grant select on public.urgency_levels, public.urgency_level_services, public.diagnosis_credits to authenticated;
grant insert, update on public.urgency_levels to authenticated;
grant insert, delete on public.urgency_level_services to authenticated;
grant all on public.urgency_levels, public.urgency_level_services, public.diagnosis_credits to service_role;

create trigger urgency_levels_audit after insert or update or delete on public.urgency_levels for each row execute function private.audit_trigger('values');
create trigger urgency_level_services_audit after insert or delete on public.urgency_level_services for each row execute function private.audit_trigger('values');
create trigger diagnosis_credits_audit after insert or update on public.diagnosis_credits for each row execute function private.audit_trigger('values');
