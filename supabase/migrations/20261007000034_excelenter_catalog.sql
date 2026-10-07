-- CATÁLOGO EXCELENTER · 34 · Productos de un proveedor sincronizados en `products` (sin segunda tabla de productos).
--  · Venta SOLO por WhatsApp: ningún producto con `source` entra a pedidos ni a Mercado Pago (disparador en order_items).
--  · Identidad: (source, source_product_id). Una sincronización nunca duplica: si el id existe, actualiza.
--  · Precio al cliente = round(precio fuente × 1,20) calculado SIEMPRE en la base de datos (disparador) → nadie puede fijarlo a mano.
--  · El costo del proveedor (precio fuente y cantidad) vive en `product_source` (solo administración): el público nunca lo ve.
--  · Visibilidad pública = is_active (decisión manual del SUPERADMIN; la sincronización NUNCA la toca) Y source_available (señal de la fuente).
--  · Nunca se borra: sin stock o ausente de la fuente → source_available = false con motivo y fecha.

-- ---------------------------------------------------------------- utilidades de normalización (identidad estable)
create function private.norm_text(t text) returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g'))
$$;
create function private.norm_key(t text) returns text language sql immutable set search_path = '' as $$
  select lower(translate(private.norm_text(t), 'áàäâÁÀÄÂéèëêÉÈËÊíìïîÍÌÏÎóòöôÓÒÖÔúùüûÚÙÜÛñÑ', 'aaaaaaaaeeeeeeeeiiiiiiiioooooooouuuuuuuunn'))
$$;
create function private.slugify(t text) returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(private.norm_key(t), '[^a-z0-9]+', '-', 'g'), '-')
$$;

-- ---------------------------------------------------------------- subcategorías de productos
create table public.product_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.product_categories (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (char_length(name) between 2 and 80),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);
create unique index product_subcategories_name_key on public.product_subcategories (category_id, private.norm_key(name));
create trigger product_subcategories_updated before update on public.product_subcategories for each row execute function private.set_updated_at();
-- Una sola categoría por nombre normalizado («Periféricos» = «PERIFERICOS» = «Periféricos »).
create unique index product_categories_name_key on public.product_categories (private.norm_key(name));

-- ---------------------------------------------------------------- columnas de `products` (todas públicas y sin costo del proveedor)
alter table public.products
  add column subcategory_id uuid references public.product_subcategories (id) on delete restrict,
  add column source text check (source is null or source ~ '^[A-Z_]{3,30}$'),
  add column source_product_id text check (source_product_id is null or char_length(source_product_id) between 1 and 80),
  add column source_ref text check (source_ref is null or char_length(source_ref) <= 80),
  add column source_available boolean not null default true,
  add column image_url text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 500)),
  add column last_synced_at timestamptz,
  add constraint products_source_pair check ((source is null) = (source_product_id is null));
create unique index products_source_identity on public.products (source, source_product_id) where source is not null;
create index products_public_idx on public.products (category_id, subcategory_id) where is_active and deleted_at is null and source_available;

-- Costo del proveedor y trazabilidad: SOLO administración.
create table public.product_source (
  product_id uuid primary key references public.products (id) on delete cascade,
  source_price numeric(12, 0) not null check (source_price > 0),
  source_stock int not null check (source_stock >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  deactivated_at timestamptz,
  deactivation_reason text check (deactivation_reason is null or deactivation_reason in ('out_of_stock', 'missing_from_source')),
  updated_at timestamptz not null default now()
);
create trigger product_source_updated before update on public.product_source for each row execute function private.set_updated_at();

create table public.product_price_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  source_price numeric(12, 0) not null,
  customer_price numeric(12, 2) not null,
  run_id uuid,
  created_at timestamptz not null default now()
);
create index product_price_history_product_idx on public.product_price_history (product_id, created_at desc);
create trigger product_price_history_immutable before update or delete on public.product_price_history for each row execute function private.forbid_mutation();

create table public.catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source ~ '^[A-Z_]{3,30}$'),
  run_type text not null check (run_type in ('manual', 'automatic', 'import')),
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms int,
  products_seen int not null default 0,
  products_created int not null default 0,
  products_updated int not null default 0,
  prices_changed int not null default 0,
  stock_changed int not null default 0,
  categories_changed int not null default 0,
  images_changed int not null default 0,
  activated int not null default 0,
  deactivated int not null default 0,
  error_count int not null default 0,
  errors jsonb not null default '[]',
  warnings jsonb not null default '[]',
  triggered_by uuid references public.profiles (id) on delete set null
);
create index catalog_sync_runs_recent_idx on public.catalog_sync_runs (started_at desc);

-- Consultas por WhatsApp (sin datos personales): qué productos generan interés.
create table public.product_inquiries (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  created_at timestamptz not null default now()
);
create index product_inquiries_product_idx on public.product_inquiries (product_id, created_at desc);

-- ---------------------------------------------------------------- guardas de integridad
-- 1) El precio de un producto de proveedor se deriva del costo (+20 %); nadie lo escribe a mano. 2) Desde la API solo se editan
--    garantía y visibilidad: catálogo, nombre, categoría, imagen y precio los manda la fuente.
create function private.guard_source_product() returns trigger
language plpgsql set search_path = '' as $$
declare v_cost numeric;
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.source is not null then raise exception 'source_columns_locked' using errcode = '42501'; end if;
    if tg_op = 'UPDATE' and old.source is not null and (
      (new.source, new.source_product_id, new.source_ref, new.source_available, new.image_url, new.last_synced_at, new.sku, new.name, new.brand,
       new.description, new.category_id, new.subcategory_id, new.price)
      is distinct from
      (old.source, old.source_product_id, old.source_ref, old.source_available, old.image_url, old.last_synced_at, old.sku, old.name, old.brand,
       old.description, old.category_id, old.subcategory_id, old.price)) then
      raise exception 'source_columns_locked' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.source is null and new.source is not null then raise exception 'source_columns_locked' using errcode = '42501'; end if;
  end if;
  if tg_op = 'UPDATE' and old.source is not null and new.source is distinct from old.source then
    raise exception 'source_immutable' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger products_source_guard before insert or update on public.products for each row execute function private.guard_source_product();

-- Los productos de proveedor no se venden por la tienda propia ni por Mercado Pago.
create function private.reject_source_product_in_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.product_id is not null and exists (select 1 from public.products p where p.id = new.product_id and p.source is not null) then
    raise exception 'product_unavailable' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger order_items_no_source_products before insert or update of product_id on public.order_items for each row execute function private.reject_source_product_in_order();

-- ---------------------------------------------------------------- RLS y privilegios
alter table public.product_subcategories enable row level security;
alter table public.product_source enable row level security;
alter table public.product_price_history enable row level security;
alter table public.catalog_sync_runs enable row level security;
alter table public.product_inquiries enable row level security;

create policy product_subcategories_public_read on public.product_subcategories for select to anon, authenticated using (is_active);
create policy product_subcategories_admin_all on public.product_subcategories for all to authenticated
  using ((select private.has_permission('catalog.manage'))) with check ((select private.has_permission('catalog.manage')));
create policy product_source_admin_read on public.product_source for select to authenticated using ((select private.has_permission('catalog.manage')));
create policy product_price_history_admin_read on public.product_price_history for select to authenticated using ((select private.has_permission('catalog.manage')));
create policy catalog_sync_runs_admin_read on public.catalog_sync_runs for select to authenticated using ((select private.has_permission('catalog.manage')));
create policy product_inquiries_admin_read on public.product_inquiries for select to authenticated using ((select private.has_permission('catalog.manage')));

-- Lo que ve el público: solo productos activos (decisión manual) Y disponibles según la fuente.
drop policy products_public_read on public.products;
create policy products_public_read on public.products for select to anon, authenticated using (is_active and deleted_at is null and source_available);
drop policy product_links_public_read on public.product_service_links;
create policy product_links_public_read on public.product_service_links for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active and p.deleted_at is null and p.source_available));

grant select on public.product_subcategories to anon, authenticated;
grant insert, update on public.product_subcategories to authenticated;
grant select on public.product_source, public.product_price_history, public.catalog_sync_runs, public.product_inquiries to authenticated;

-- Auditoría de cambios de configuración del catálogo (valores, sin datos personales).
create trigger product_subcategories_audit after insert or update or delete on public.product_subcategories for each row execute function private.audit_trigger('values');

-- ---------------------------------------------------------------- motor de sincronización (solo servidor)
-- p_items: arreglo de {source_product_id, source_ref, name, brand, category, subcategory, price, stock, description, image_url}.
-- Reglas: idempotente; datos inválidos NO destruyen el último dato válido; una fuente vacía o que «pierde» más de la mitad del catálogo
-- se rechaza sin tocar nada; la visibilidad manual (is_active) jamás se modifica.
create function public.sync_catalog(p_source text, p_items jsonb, p_run_type text, p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_run uuid; v_t0 timestamptz := clock_timestamp();
  it jsonb; v_id text; v_ref text; v_name text; v_brand text; v_desc text; v_img text; v_cat text; v_sub text;
  v_price numeric; v_stock int; v_cat_id uuid; v_sub_id uuid; v_slug text; v_base text;
  pr public.products%rowtype; ps public.product_source%rowtype; v_found boolean; v_avail boolean; v_changed boolean;
  v_seen text[] := '{}'; v_valid int := 0; v_total int; v_prev int;
  n_created int := 0; n_updated int := 0; n_prices int := 0; n_stock int := 0; n_cats int := 0; n_imgs int := 0; n_act int := 0; n_deact int := 0;
  v_errors jsonb := '[]'; v_warn jsonb := '[]'; v_status text; v_n int;
begin
  if p_run_type not in ('manual', 'automatic', 'import') then raise exception 'invalid_run_type' using errcode = '22023'; end if;
  if p_source !~ '^[A-Z_]{3,30}$' then raise exception 'invalid_source' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_items' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('sync_catalog:' || p_source));
  insert into public.catalog_sync_runs (source, run_type, triggered_by) values (p_source, p_run_type, p_actor) returning id into v_run;
  v_total := jsonb_array_length(p_items);

  -- Pasada 1: cuántos elementos son válidos (y qué ids existen aunque el dato esté incompleto).
  for it in select * from jsonb_array_elements(p_items) loop
    v_id := private.norm_text(it ->> 'source_product_id');
    if v_id <> '' then v_seen := v_seen || upper(v_id); end if;
    if v_id <> '' and private.norm_text(it ->> 'name') <> '' and jsonb_typeof(it -> 'price') = 'number' and (it ->> 'price')::numeric > 0
       and jsonb_typeof(it -> 'stock') = 'number' and (it ->> 'stock')::numeric >= 0 then
      v_valid := v_valid + 1;
    end if;
  end loop;
  select count(*) into v_prev from public.products where source = p_source and source_available;
  if v_valid = 0 or (v_prev >= 20 and v_valid < v_prev * 0.5) then
    update public.catalog_sync_runs set status = 'error', finished_at = now(), products_seen = v_total, error_count = 1,
      errors = jsonb_build_array(jsonb_build_object('type', case when v_valid = 0 then 'empty_source' else 'suspicious_drop' end, 'valid', v_valid, 'previous_available', v_prev)),
      duration_ms = (extract(epoch from clock_timestamp() - v_t0) * 1000)::int where id = v_run;
    return jsonb_build_object('run_id', v_run, 'status', 'error', 'reason', case when v_valid = 0 then 'empty_source' else 'suspicious_drop' end);
  end if;

  -- Pasada 2: aplicar. Cada elemento va en su propio subbloque: un dato malo no afecta a los demás.
  for it in select * from jsonb_array_elements(p_items) loop
    v_id := upper(private.norm_text(it ->> 'source_product_id'));
    begin
      v_ref := left(nullif(private.norm_text(it ->> 'source_ref'), ''), 80);
      v_name := left(private.norm_text(it ->> 'name'), 160);
      if v_id = '' or v_name = '' or jsonb_typeof(it -> 'price') <> 'number' or (it ->> 'price')::numeric <= 0
         or jsonb_typeof(it -> 'stock') <> 'number' or (it ->> 'stock')::numeric < 0 then
        if v_id <> '' then v_errors := v_errors || jsonb_build_object('ref', v_id, 'type', 'invalid_data'); else v_errors := v_errors || jsonb_build_object('ref', null, 'type', 'missing_identifier'); end if;
        continue;
      end if;
      v_price := round((it ->> 'price')::numeric, 0);
      v_stock := floor((it ->> 'stock')::numeric)::int;
      v_brand := left(nullif(private.norm_text(it ->> 'brand'), ''), 60);
      v_desc := left(nullif(btrim(coalesce(it ->> 'description', '')), ''), 4000);
      v_img := nullif(btrim(coalesce(it ->> 'image_url', '')), '');
      if v_img is not null and v_img !~ '^https://' then v_img := null; end if;
      v_cat := nullif(private.norm_text(it ->> 'category'), '');
      v_sub := nullif(private.norm_text(it ->> 'subcategory'), '');
      v_avail := v_stock > 0;

      -- Categoría y subcategoría por nombre normalizado (nunca duplicadas).
      v_cat_id := null; v_sub_id := null;
      if v_cat is not null then
        select id into v_cat_id from public.product_categories where private.norm_key(name) = private.norm_key(v_cat);
        if v_cat_id is null then
          v_base := left(private.slugify(v_cat), 56);
          v_slug := v_base;
          while exists (select 1 from public.product_categories where slug = v_slug) loop v_slug := v_base || '-' || substr(md5(v_cat || v_slug), 1, 3); end loop;
          insert into public.product_categories (slug, name, sort_order) values (v_slug, v_cat, 100) returning id into v_cat_id;
        end if;
        if v_sub is not null then
          select id into v_sub_id from public.product_subcategories where category_id = v_cat_id and private.norm_key(name) = private.norm_key(v_sub);
          if v_sub_id is null then
            v_base := left(private.slugify(v_sub), 56);
            v_slug := v_base;
            while exists (select 1 from public.product_subcategories where category_id = v_cat_id and slug = v_slug) loop v_slug := v_base || '-' || substr(md5(v_sub || v_slug), 1, 3); end loop;
            insert into public.product_subcategories (category_id, slug, name, sort_order) values (v_cat_id, v_slug, v_sub, 100) returning id into v_sub_id;
          end if;
        end if;
      else
        v_warn := v_warn || jsonb_build_object('ref', v_id, 'type', 'no_category');
      end if;

      select * into pr from public.products where source = p_source and source_product_id = v_id;
      v_found := found;
      if not v_found then
        -- Slug estable: se calcula UNA vez al crear y no cambia después.
        v_base := left(private.slugify(v_name), 70);
        v_slug := v_base;
        if exists (select 1 from public.products where slug = v_slug) then v_slug := left(v_base, 58) || '-' || left(private.slugify(v_id), 20); end if;
        while exists (select 1 from public.products where slug = v_slug) loop v_slug := left(v_base, 58) || '-' || substr(md5(v_id || v_slug), 1, 6); end loop;
        insert into public.products (category_id, subcategory_id, sku, slug, name, brand, description, price, image_url, source, source_product_id, source_ref,
                                      source_available, last_synced_at)
        values (v_cat_id, v_sub_id, left(v_id, 40), v_slug, v_name, v_brand, v_desc, round(v_price * 1.20, 0), v_img, p_source, v_id, coalesce(v_ref, v_id),
                v_avail, now())
        returning * into pr;
        insert into public.product_source (product_id, source_price, source_stock, deactivated_at, deactivation_reason)
        values (pr.id, v_price, v_stock, case when v_avail then null else now() end, case when v_avail then null else 'out_of_stock' end);
        insert into public.product_price_history (product_id, source_price, customer_price, run_id) values (pr.id, v_price, round(v_price * 1.20, 0), v_run);
        n_created := n_created + 1;
        if v_stock = 0 then n_deact := n_deact + 1; end if;
      else
        select * into ps from public.product_source where product_id = pr.id;
        v_changed := false;
        if ps.source_price is distinct from v_price then
          n_prices := n_prices + 1; v_changed := true;
          insert into public.product_price_history (product_id, source_price, customer_price, run_id) values (pr.id, v_price, round(v_price * 1.20, 0), v_run);
          if ps.source_price > 0 and abs(v_price - ps.source_price) / ps.source_price > 0.20 then
            v_warn := v_warn || jsonb_build_object('ref', v_id, 'type', 'price_jump', 'from', ps.source_price, 'to', v_price);
          end if;
        end if;
        if ps.source_stock is distinct from v_stock then n_stock := n_stock + 1; v_changed := true; end if;
        if pr.category_id is distinct from v_cat_id or pr.subcategory_id is distinct from v_sub_id then n_cats := n_cats + 1; v_changed := true; end if;
        if v_img is not null and pr.image_url is distinct from v_img then n_imgs := n_imgs + 1; v_changed := true; end if;
        if (pr.name, pr.brand, pr.description) is distinct from (v_name, v_brand, v_desc) then v_changed := true; end if;
        if pr.source_available and not v_avail then n_deact := n_deact + 1; v_changed := true; end if;
        if not pr.source_available and v_avail then n_act := n_act + 1; v_changed := true; end if;
        update public.products set category_id = v_cat_id, subcategory_id = v_sub_id, name = v_name, brand = v_brand, description = v_desc,
          price = round(v_price * 1.20, 0), image_url = coalesce(v_img, image_url), source_available = v_avail, source_ref = coalesce(v_ref, source_ref), last_synced_at = now()
          where id = pr.id;
        update public.product_source set source_price = v_price, source_stock = v_stock, last_seen_at = now(),
          deactivated_at = case when v_avail then null when pr.source_available then now() else coalesce(deactivated_at, now()) end,
          deactivation_reason = case when v_avail then null when pr.source_available then 'out_of_stock' else coalesce(deactivation_reason, 'out_of_stock') end
          where product_id = pr.id;
        if v_changed then n_updated := n_updated + 1; end if;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('ref', v_id, 'type', 'apply_failed', 'code', sqlstate);
    end;
  end loop;

  -- Ausentes de la fuente: se ocultan (con motivo y fecha), sin borrar. Los que llegaron con datos inválidos cuentan como «vistos».
  with gone as (
    update public.products set source_available = false, last_synced_at = now()
    where source = p_source and source_available and upper(source_product_id) <> all (v_seen)
    returning id
  ), mark as (
    update public.product_source ps2 set deactivated_at = now(), deactivation_reason = 'missing_from_source' from gone where ps2.product_id = gone.id returning 1
  )
  select count(*) into v_n from mark;
  n_deact := n_deact + coalesce(v_n, 0);

  v_status := case when jsonb_array_length(v_errors) > 0 then 'partial' else 'success' end;
  update public.catalog_sync_runs set status = v_status, finished_at = now(), products_seen = v_total, products_created = n_created, products_updated = n_updated,
    prices_changed = n_prices, stock_changed = n_stock, categories_changed = n_cats, images_changed = n_imgs, activated = n_act, deactivated = n_deact,
    error_count = jsonb_array_length(v_errors), errors = v_errors, warnings = v_warn, duration_ms = (extract(epoch from clock_timestamp() - v_t0) * 1000)::int
    where id = v_run;
  return jsonb_build_object('run_id', v_run, 'status', v_status, 'seen', v_total, 'created', n_created, 'updated', n_updated, 'prices_changed', n_prices,
    'stock_changed', n_stock, 'activated', n_act, 'deactivated', n_deact, 'errors', jsonb_array_length(v_errors), 'warnings', jsonb_array_length(v_warn));
end $$;

-- Registro de un fallo de la fuente (no toca el catálogo: se conserva el último estado válido).
create function public.record_catalog_sync_failure(p_source text, p_run_type text, p_reason text, p_actor uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_source !~ '^[A-Z_]{3,30}$' or p_run_type not in ('manual', 'automatic', 'import') then raise exception 'invalid_args' using errcode = '22023'; end if;
  insert into public.catalog_sync_runs (source, run_type, status, finished_at, duration_ms, error_count, errors, triggered_by)
  values (p_source, p_run_type, 'error', now(), 0, 1, jsonb_build_array(jsonb_build_object('type', 'source_unavailable', 'reason', left(p_reason, 200))), p_actor)
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.sync_catalog(text, jsonb, text, uuid), public.record_catalog_sync_failure(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.sync_catalog(text, jsonb, text, uuid), public.record_catalog_sync_failure(text, text, text, uuid) to service_role;
grant execute on function private.norm_key(text), private.norm_text(text), private.slugify(text) to authenticated, service_role;
