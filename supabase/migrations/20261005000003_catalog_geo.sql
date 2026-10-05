-- FASE 1 · 03 · Cobertura geográfica, catálogo de servicios, productos e inventario.

-- Cobertura física configurable por administración. El soporte remoto es nacional y NO depende de esta tabla.
create table public.coverage_areas (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null default 'CO' check (country_code = 'CO'),
  department text not null check (char_length(department) between 2 and 80),
  city_name text not null check (char_length(city_name) between 2 and 80),
  dane_code text not null unique check (dane_code ~ '^[0-9]{5}$'),
  is_active boolean not null default true,
  allowed_modalities public.service_modality[] not null default '{store,pickup,home}'
    check (cardinality(allowed_modalities) > 0 and not ('remote' = any (allowed_modalities))),
  pickup_fee numeric(12, 2) not null default 0 check (pickup_fee >= 0),
  home_fee numeric(12, 2) not null default 0 check (home_fee >= 0),
  notes text check (notes is null or char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger coverage_updated before update on public.coverage_areas for each row execute function private.set_updated_at();

-- ¿Se puede prestar esta modalidad en este municipio? Remoto: siempre. Físico: solo municipios activos configurados.
create function public.check_coverage(p_dane_code text, p_modality public.service_modality) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_modality = 'remote' or exists (
    select 1 from public.coverage_areas c
    where c.dane_code = p_dane_code and c.is_active and p_modality = any (c.allowed_modalities))
$$;

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (char_length(name) between 2 and 80),
  kind public.service_kind not null,
  description text check (description is null or char_length(description) <= 300),
  icon text check (icon is null or char_length(icon) <= 40),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger service_categories_updated before update on public.service_categories for each row execute function private.set_updated_at();

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.service_categories (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  name text not null check (char_length(name) between 2 and 120),
  kind public.service_kind not null,
  short_description text check (short_description is null or char_length(short_description) <= 200),
  description text check (description is null or char_length(description) <= 4000),
  price_mode public.price_mode not null default 'fixed',
  base_price numeric(12, 2) check (base_price is null or base_price >= 0),
  price_unit text check (price_unit is null or char_length(price_unit) <= 20),
  duration_minutes int check (duration_minutes is null or duration_minutes between 5 and 10080),
  allowed_modalities public.service_modality[] not null check (cardinality(allowed_modalities) > 0),
  requires_equipment boolean not null default true,
  requires_diagnosis boolean not null default true,
  requires_quote boolean not null default true,
  default_warranty_days int not null default 0 check (default_warranty_days between 0 and 3650),
  default_warranty_kind public.warranty_kind not null default 'labor',
  seo_title text check (seo_title is null or char_length(seo_title) <= 70),
  seo_description text check (seo_description is null or char_length(seo_description) <= 170),
  image_public_id text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (price_mode = 'quote' or base_price is not null)
);
create index services_category_idx on public.services (category_id) where deleted_at is null;
create index services_active_idx on public.services (kind, sort_order) where is_active and deleted_at is null;
create trigger services_updated before update on public.services for each row execute function private.set_updated_at();

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (char_length(name) between 2 and 80),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger product_categories_updated before update on public.product_categories for each row execute function private.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.product_categories (id) on delete restrict,
  sku text not null unique check (char_length(sku) between 2 and 40),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  name text not null check (char_length(name) between 2 and 160),
  brand text check (brand is null or char_length(brand) <= 60),
  description text check (description is null or char_length(description) <= 4000),
  price numeric(12, 2) not null check (price >= 0),
  warranty_days int not null default 0 check (warranty_days between 0 and 3650),
  image_public_ids text[] not null default '{}' check (cardinality(image_public_ids) <= 10),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index products_category_idx on public.products (category_id) where deleted_at is null;
create trigger products_updated before update on public.products for each row execute function private.set_updated_at();

create table public.product_service_links (
  product_id uuid not null references public.products (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  link_kind text not null default 'installation' check (link_kind in ('installation')),
  primary key (product_id, service_id)
);

create table public.inventory (
  product_id uuid primary key references public.products (id) on delete restrict,
  stock_on_hand int not null default 0 check (stock_on_hand >= 0),
  reorder_level int not null default 0 check (reorder_level >= 0),
  updated_at timestamptz not null default now()
);

-- Solo se altera el stock insertando movimientos (libro mayor inmutable).
create table public.inventory_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete restrict,
  delta int not null check (delta <> 0),
  reason text not null check (reason in ('purchase', 'sale', 'adjustment', 'return', 'install_use')),
  reference_type text,
  reference_id uuid,
  note text check (note is null or char_length(note) <= 300),
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index inventory_movements_product_idx on public.inventory_movements (product_id, created_at desc);
create trigger inventory_movements_immutable before update or delete on public.inventory_movements
  for each row execute function private.forbid_mutation();

create function private.apply_inventory_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_stock int;
begin
  select stock_on_hand into v_stock from public.inventory where product_id = new.product_id for update;
  if coalesce(v_stock, 0) + new.delta < 0 then raise exception 'insufficient_stock' using errcode = '23514'; end if;
  insert into public.inventory (product_id, stock_on_hand) values (new.product_id, greatest(new.delta, 0))
  on conflict (product_id) do update set stock_on_hand = public.inventory.stock_on_hand + new.delta, updated_at = now();
  return new;
end $$;
create trigger inventory_movements_apply after insert on public.inventory_movements
  for each row execute function private.apply_inventory_movement();
-- stock directo: solo el trigger/propietario puede modificar el saldo
create function private.guard_inventory() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.stock_on_hand is distinct from old.stock_on_hand and not private.is_privileged_session() then
    raise exception 'stock_only_via_movements' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger inventory_guard before update on public.inventory for each row execute function private.guard_inventory();

-- ---------------------------------------------------------------- configuración
create table public.app_settings (
  key text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)*$'),
  value jsonb not null,
  description text,
  is_public boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.coverage_areas (department, city_name, dane_code) values
  ('Valle del Cauca', 'Cali', '76001'),
  ('Valle del Cauca', 'Palmira', '76520'),
  ('Valle del Cauca', 'Jamundí', '76364'),
  ('Valle del Cauca', 'Yumbo', '76892');

insert into public.app_settings (key, value, description, is_public) values
  ('maintenance.default_months', '6', 'Meses hasta el próximo mantenimiento recomendado tras una entrega', false),
  ('reception.min_photos', '4', 'Fotografías mínimas de recepción antes de pasar a diagnóstico', false),
  ('quote.default_validity_days', '15', 'Vigencia por defecto de una cotización (días)', false),
  ('ai.disclaimer', '"Diagnóstico preliminar generado con asistencia de IA. La recomendación está sujeta a verificación técnica presencial."',
   'Aviso obligatorio para cualquier diagnóstico asistido por IA', true),
  ('business.timezone', '"America/Bogota"', 'Zona horaria del negocio', true);
