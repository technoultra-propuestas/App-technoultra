-- FASE 1 · 05 · Proyectos digitales, cotizaciones, pedidos, pagos y garantías.
-- Regla: el dinero se calcula y confirma en servidor. Ningún total/precio llega "confiable" desde el navegador.

create table public.digital_projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default private.next_code('PRO'),
  customer_id uuid not null references public.customers (id) on delete restrict,
  service_id uuid references public.services (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  scope text check (scope is null or char_length(scope) <= 4000),
  status public.project_status not null default 'lead',
  progress smallint not null default 0 check (progress between 0 and 100),
  owner_id uuid references public.profiles (id) on delete restrict,
  starts_on date,
  due_on date,
  client_notes text check (client_notes is null or char_length(client_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (due_on is null or starts_on is null or due_on >= starts_on)
);
create index digital_projects_customer_idx on public.digital_projects (customer_id) where deleted_at is null;
create trigger digital_projects_updated before update on public.digital_projects for each row execute function private.set_updated_at();

create table public.project_status_history (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.digital_projects (id) on delete restrict,
  from_status public.project_status,
  to_status public.project_status not null,
  actor_id uuid default auth.uid(),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create trigger project_history_immutable before update or delete on public.project_status_history
  for each row execute function private.forbid_mutation();

create function private.project_status_logged() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.project_status_history (project_id, from_status, to_status, actor_id)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return new;
end $$;
create trigger digital_projects_history after insert or update of status on public.digital_projects
  for each row execute function private.project_status_logged();

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.digital_projects (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 160),
  storage_ref text not null,
  visibility text not null default 'internal' check (visibility in ('internal', 'client')),
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.project_comments (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.digital_projects (id) on delete restrict,
  author_id uuid default auth.uid(),
  visibility text not null default 'client' check (visibility in ('internal', 'client')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create trigger project_comments_immutable before update or delete on public.project_comments
  for each row execute function private.forbid_mutation();

-- ---------------------------------------------------------------- cotizaciones
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default private.next_code('COT'),
  ticket_id uuid references public.tickets (id) on delete restrict,
  project_id uuid references public.digital_projects (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  version int not null default 1 check (version > 0),
  supersedes_id uuid references public.quotes (id) on delete restrict,
  status public.quote_status not null default 'draft',
  valid_until date,
  notes text check (notes is null or char_length(notes) <= 2000),
  terms text check (terms is null or char_length(terms) <= 4000),
  needs_part boolean not null default false,
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  discount_total numeric(14, 2) not null default 0 check (discount_total >= 0),
  tax_total numeric(14, 2) not null default 0 check (tax_total >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  sent_at timestamptz,
  decided_at timestamptz,
  decided_by uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ticket_id is not null or project_id is not null),
  check (ticket_id is null or project_id is null)
);
create index quotes_ticket_idx on public.quotes (ticket_id, version desc);
create index quotes_customer_idx on public.quotes (customer_id, created_at desc);
-- una sola cotización "viva" por ticket
create unique index quotes_one_open_per_ticket on public.quotes (ticket_id)
  where ticket_id is not null and status in ('draft', 'sent', 'clarification', 'approved');
create trigger quotes_updated before update on public.quotes for each row execute function private.set_updated_at();

-- Triggers de protección: SECURITY INVOKER a propósito (current_user debe reflejar a quien ejecuta la sentencia).
create function private.guard_quote() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not private.is_privileged_session() then
      new.status := 'draft'; new.subtotal := 0; new.discount_total := 0; new.tax_total := 0; new.total := 0;
      new.sent_at := null; new.decided_at := null; new.decided_by := null;
    end if;
    return new;
  end if;
  if (new.status, new.subtotal, new.discount_total, new.tax_total, new.total, new.sent_at, new.decided_at, new.decided_by,
      new.ticket_id, new.project_id, new.customer_id, new.code, new.version)
     is distinct from
     (old.status, old.subtotal, old.discount_total, old.tax_total, old.total, old.sent_at, old.decided_at, old.decided_by,
      old.ticket_id, old.project_id, old.customer_id, old.code, old.version)
     and not private.is_privileged_session() then
    raise exception 'privileged_column' using errcode = '42501';
  end if;
  if old.status <> 'draft' and (new.valid_until, new.notes, new.terms, new.needs_part) is distinct from (old.valid_until, old.notes, old.terms, old.needs_part)
     and not private.is_privileged_session() then
    raise exception 'quote_not_editable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger quotes_guard before insert or update on public.quotes for each row execute function private.guard_quote();

create function private.validate_quote() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.ticket_id is not null and not exists (select 1 from public.tickets t where t.id = new.ticket_id and t.customer_id = new.customer_id) then
    raise exception 'quote_customer_mismatch' using errcode = '42501';
  end if;
  if new.project_id is not null and not exists (select 1 from public.digital_projects d where d.id = new.project_id and d.customer_id = new.customer_id) then
    raise exception 'quote_customer_mismatch' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger quotes_validate before insert on public.quotes for each row execute function private.validate_quote();

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  position int not null default 1 check (position > 0),
  kind public.item_kind not null,
  service_id uuid references public.services (id) on delete restrict,
  product_id uuid references public.products (id) on delete restrict,
  description text not null check (char_length(btrim(description)) between 2 and 200),
  qty numeric(10, 2) not null check (qty > 0 and qty <= 9999),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  warranty_days int not null default 0 check (warranty_days between 0 and 3650),
  warranty_kind public.warranty_kind not null default 'labor',
  line_subtotal numeric(14, 2) generated always as (round(qty * unit_price - discount, 2)) stored,
  line_tax numeric(14, 2) generated always as (round((qty * unit_price - discount) * tax_rate / 100, 2)) stored,
  check (discount <= qty * unit_price),
  check ((kind = 'service') = (service_id is not null)),
  check ((kind = 'product') = (product_id is not null)),
  unique (quote_id, position)
);
create index quote_items_quote_idx on public.quote_items (quote_id);

-- Helpers definer (lectura mínima) para que el trigger pueda ser INVOKER.
create function private.quote_status_of(p_quote uuid) returns public.quote_status
language sql stable security definer set search_path = '' as $$ select status from public.quotes where id = p_quote $$;
create function private.catalog_price(p_kind public.item_kind, p_id uuid, out price numeric, out mode public.price_mode)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_kind = 'service' then
    select s.base_price, s.price_mode into price, mode from public.services s where s.id = p_id and s.is_active and s.deleted_at is null;
    if not found then raise exception 'service_unavailable' using errcode = '23514'; end if;
  else
    select p.price, 'fixed'::public.price_mode into price, mode from public.products p where p.id = p_id and p.is_active and p.deleted_at is null;
    if not found then raise exception 'product_unavailable' using errcode = '23514'; end if;
  end if;
end $$;

-- Precio de catálogo obligatorio: el servidor lo rellena; desviarse exige el permiso pricing.override.
create function private.quote_item_before() returns trigger
language plpgsql set search_path = '' as $$
declare v_cat numeric; v_mode public.price_mode; v_qid uuid := coalesce(new.quote_id, old.quote_id);
begin
  if private.quote_status_of(v_qid) is distinct from 'draft' and not private.is_privileged_session() then
    raise exception 'quote_not_editable' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.kind in ('service', 'product') then
    select c.price, c.mode into v_cat, v_mode
    from private.catalog_price(new.kind, coalesce(new.service_id, new.product_id)) c;
    if v_mode <> 'quote' then
      if new.unit_price is null then
        new.unit_price := v_cat;
      elsif new.unit_price <> v_cat and not (private.is_privileged_session() or private.has_permission('pricing.override')) then
        raise exception 'price_override_forbidden' using errcode = '42501';
      end if;
    end if;
  end if;
  if new.unit_price is null then raise exception 'price_required' using errcode = '23502'; end if;
  return new;
end $$;
create trigger quote_items_before before insert or update or delete on public.quote_items
  for each row execute function private.quote_item_before();

create function private.recalc_quote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_qid uuid := coalesce(new.quote_id, old.quote_id);
begin
  update public.quotes q set
    subtotal = coalesce(s.sub, 0) + coalesce(s.disc, 0),
    discount_total = coalesce(s.disc, 0),
    tax_total = coalesce(s.tax, 0),
    total = coalesce(s.sub, 0) + coalesce(s.tax, 0)
  from (select sum(line_subtotal) sub, sum(discount) disc, sum(line_tax) tax from public.quote_items where quote_id = v_qid) s
  where q.id = v_qid;
  return null;
end $$;
create trigger quote_items_recalc after insert or update or delete on public.quote_items
  for each row execute function private.recalc_quote();

create table public.quote_events (
  id bigint generated always as identity primary key,
  quote_id uuid not null references public.quotes (id) on delete restrict,
  event_type text not null check (event_type in
    ('created', 'sent', 'viewed', 'question', 'answered', 'approved', 'rejected', 'expired', 'revised')),
  actor_id uuid default auth.uid(),
  actor_role text,
  message text check (message is null or char_length(message) <= 1000),
  created_at timestamptz not null default now()
);
create index quote_events_quote_idx on public.quote_events (quote_id, created_at);
create trigger quote_events_immutable before update or delete on public.quote_events
  for each row execute function private.forbid_mutation();

-- ---------------------------------------------------------------- tienda
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default private.next_code('PED'),
  customer_id uuid not null references public.customers (id) on delete restrict,
  status public.order_status not null default 'new',
  delivery_method text not null default 'delivery' check (delivery_method in ('pickup_store', 'delivery')),
  address_id uuid references public.addresses (id) on delete restrict,
  ticket_id uuid references public.tickets (id) on delete restrict,
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  shipping_fee numeric(12, 2) not null default 0 check (shipping_fee >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create trigger orders_updated before update on public.orders for each row execute function private.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete restrict,
  service_id uuid references public.services (id) on delete restrict,
  description text not null check (char_length(description) between 2 and 200),
  qty int not null check (qty between 1 and 999),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  warranty_days int not null default 0 check (warranty_days between 0 and 3650),
  line_total numeric(14, 2) generated always as (qty * unit_price) stored,
  check (product_id is not null or service_id is not null)
);
create index order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------- pagos (solo el servidor escribe)
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default private.next_code('PAG'),
  customer_id uuid not null references public.customers (id) on delete restrict,
  order_id uuid references public.orders (id) on delete restrict,
  quote_id uuid references public.quotes (id) on delete restrict,
  ticket_id uuid references public.tickets (id) on delete restrict,
  provider public.payment_provider not null,
  method text check (method is null or char_length(method) <= 40),
  status public.payment_status not null default 'pending',
  amount numeric(14, 2) not null check (amount > 0),
  currency char(3) not null default 'COP' check (currency = 'COP'),
  external_id text,
  external_reference text unique,
  idempotency_key text unique,
  approved_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (order_id is not null or quote_id is not null or ticket_id is not null),
  check (status <> 'approved' or approved_at is not null),
  check (provider <> 'manual' or status <> 'approved' or confirmed_by is not null),
  unique (provider, external_id)
);
create index payments_customer_idx on public.payments (customer_id, created_at desc);
create index payments_order_idx on public.payments (order_id);
create trigger payments_updated before update on public.payments for each row execute function private.set_updated_at();
-- Un pago aprobado es definitivo (los reembolsos se modelan con estado 'refunded' y no se reabren).
create function private.guard_payment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status in ('approved', 'refunded', 'cancelled', 'rejected', 'expired') and new.status is distinct from old.status
     and not (old.status = 'approved' and new.status = 'refunded') then
    raise exception 'payment_final_state' using errcode = '42501';
  end if;
  if (new.amount, new.currency, new.customer_id, new.provider, new.order_id, new.quote_id) is distinct from
     (old.amount, old.currency, old.customer_id, old.provider, old.order_id, old.quote_id) then
    raise exception 'payment_fields_immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger payments_guard before update on public.payments for each row execute function private.guard_payment();

create table public.payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid references public.payments (id) on delete restrict,
  provider public.payment_provider not null,
  provider_event_id text not null,
  event_type text,
  payload jsonb not null check (pg_column_size(payload) < 65536),
  signature_valid boolean not null,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create index payment_events_payment_idx on public.payment_events (payment_id);
create function private.guard_payment_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'immutable_table' using errcode = '42501'; end if;
  if (new.provider, new.provider_event_id, new.payload, new.signature_valid, new.received_at, new.payment_id)
     is distinct from (old.provider, old.provider_event_id, old.payload, old.signature_valid, old.received_at, old.payment_id)
     and not (old.payment_id is null and new.payment_id is not null) then
    raise exception 'immutable_table' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger payment_events_guard before update or delete on public.payment_events
  for each row execute function private.guard_payment_event();

-- ---------------------------------------------------------------- garantías
create table public.warranties (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default private.next_code('GAR'),
  kind public.warranty_kind not null,
  customer_id uuid not null references public.customers (id) on delete restrict,
  ticket_id uuid references public.tickets (id) on delete restrict,
  equipment_id uuid references public.equipment (id) on delete restrict,
  quote_item_id uuid unique references public.quote_items (id) on delete restrict,
  order_item_id uuid unique references public.order_items (id) on delete restrict,
  description text not null check (char_length(description) between 2 and 200),
  serial text check (serial is null or char_length(serial) <= 60),
  start_date date not null,
  end_date date not null,
  status public.warranty_status not null default 'active',
  coverage text check (coverage is null or char_length(coverage) <= 1000),
  exclusions text check (exclusions is null or char_length(exclusions) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (ticket_id is not null or order_item_id is not null)
);
create index warranties_customer_idx on public.warranties (customer_id, end_date);
create trigger warranties_updated before update on public.warranties for each row execute function private.set_updated_at();
create function private.guard_warranty() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.kind, new.customer_id, new.start_date, new.end_date, new.quote_item_id, new.order_item_id, new.code)
     is distinct from (old.kind, old.customer_id, old.start_date, old.end_date, old.quote_item_id, old.order_item_id, old.code)
     and not private.is_privileged_session() then
    raise exception 'privileged_column' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger warranties_guard before update on public.warranties for each row execute function private.guard_warranty();
