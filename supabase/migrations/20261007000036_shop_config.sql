-- SHOP · 36 · Configuración administrable de la tienda (banner, textos, envío, destacados). Todo lo que ve el público sale de aquí;
-- nada promocional queda fijo en el código. Solo el SUPERADMIN (permiso catalog.manage, con MFA) escribe; el público solo lee lo vigente.

-- ---------------------------------------------------------------- destacados y orden
alter table public.products
  add column is_featured boolean not null default false,
  add column featured_rank int not null default 0 check (featured_rank between 0 and 9999);
alter table public.product_categories add column is_featured boolean not null default false;
create index products_featured_idx on public.products (featured_rank, name) where is_featured and is_active and deleted_at is null and source_available;

-- ---------------------------------------------------------------- ajustes de la tienda (una sola fila)
create table public.shop_settings (
  id boolean primary key default true check (id),
  title text not null default 'SHOP' check (char_length(btrim(title)) between 2 and 40),
  subtitle text check (subtitle is null or char_length(subtitle) <= 160),
  show_featured boolean not null default true,
  shipping_enabled boolean not null default true,
  shipping_title text not null default 'Envíos TechnoUltra' check (char_length(btrim(shipping_title)) between 2 and 60),
  -- Tarifas informativas de entrega de PRODUCTOS (independientes de las tarifas de servicios técnicos en coverage_areas).
  shipping_urban_fee int not null default 10000 check (shipping_urban_fee between 0 and 200000),
  shipping_outside_fee int not null default 20000 check (shipping_outside_fee between 0 and 200000),
  shipping_note text not null default 'Valor sujeto a validación de dirección.' check (char_length(shipping_note) <= 160),
  whatsapp_intro text not null default 'Quiero consultar la compra de los siguientes productos:' check (char_length(btrim(whatsapp_intro)) between 3 and 200),
  whatsapp_closing text not null default '¿Me pueden confirmar disponibilidad y coordinar la entrega?' check (char_length(btrim(whatsapp_closing)) between 3 and 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.shop_settings default values;
create trigger shop_settings_updated before update on public.shop_settings for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- banners promocionales
create table public.shop_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  subtitle text check (subtitle is null or char_length(subtitle) <= 160),
  image_url text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 500)),
  cta_label text check (cta_label is null or char_length(cta_label) <= 30),
  cta_href text check (cta_href is null or (char_length(cta_href) <= 300 and cta_href ~ '^(/[A-Za-z0-9/_?=&%.#-]*|https://[^[:space:]]+)$')),
  -- Tonos permitidos por el sistema de diseño (no se eligen colores libres).
  tone text not null default 'dark' check (tone in ('dark', 'brand', 'light')),
  is_active boolean not null default false,
  priority int not null default 0 check (priority between 0 and 999),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index shop_banners_live_idx on public.shop_banners (priority desc) where is_active;
create trigger shop_banners_updated before update on public.shop_banners for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- RLS y privilegios
alter table public.shop_settings enable row level security;
alter table public.shop_banners enable row level security;

create policy shop_settings_public_read on public.shop_settings for select to anon, authenticated using (true);
create policy shop_settings_admin_update on public.shop_settings for update to authenticated
  using ((select private.has_permission('catalog.manage'))) with check ((select private.has_permission('catalog.manage')));

-- El público solo ve banners activos y dentro de su ventana de fechas; la administración ve todos.
create policy shop_banners_public_read on public.shop_banners for select to anon, authenticated
  using (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
create policy shop_banners_admin_all on public.shop_banners for all to authenticated
  using ((select private.has_permission('catalog.manage'))) with check ((select private.has_permission('catalog.manage')));

grant select on public.shop_settings, public.shop_banners to anon, authenticated;
grant update (title, subtitle, show_featured, shipping_enabled, shipping_title, shipping_urban_fee, shipping_outside_fee, shipping_note, whatsapp_intro, whatsapp_closing, updated_by) on public.shop_settings to authenticated;
grant insert, update, delete on public.shop_banners to authenticated;
grant all on public.shop_settings, public.shop_banners to service_role;

create trigger shop_settings_audit after insert or update or delete on public.shop_settings for each row execute function private.audit_trigger('values');
create trigger shop_banners_audit after insert or update or delete on public.shop_banners for each row execute function private.audit_trigger('values');
