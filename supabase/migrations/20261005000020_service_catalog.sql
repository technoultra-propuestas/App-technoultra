-- CATÁLOGO OFICIAL · 20 · Estructura para el catálogo real de servicios: subcategorías, datos comerciales completos,
-- trazabilidad de la carga inicial (Excel → BD), snapshots históricos y eliminación segura (lógica si hay historial).
-- La aplicación consulta SIEMPRE estas tablas; el Excel solo alimenta la carga inicial (scripts/import-catalog.mjs).

-- ---------------------------------------------------------------- subcategorías
create table public.service_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);
create index service_subcategories_category_idx on public.service_subcategories (category_id, sort_order);
create trigger service_subcategories_updated before update on public.service_subcategories
  for each row execute function private.set_updated_at();

alter table public.service_categories
  add column app_location text check (app_location is null or char_length(app_location) <= 60),
  add column commercial_priority text check (commercial_priority is null or char_length(commercial_priority) <= 40);

-- ---------------------------------------------------------------- datos comerciales del servicio
alter table public.services
  add column subcategory_id uuid references public.service_subcategories (id) on delete restrict,
  add column includes_text text check (includes_text is null or char_length(includes_text) <= 1000),
  add column excludes_text text check (excludes_text is null or char_length(excludes_text) <= 1000),
  add column price_treatment text check (price_treatment is null or char_length(price_treatment) <= 1000),
  add column estimated_time text check (estimated_time is null or char_length(estimated_time) <= 60),
  add column modality_label text check (modality_label is null or char_length(modality_label) <= 80),
  add column price_type_label text check (price_type_label is null or char_length(price_type_label) <= 40),
  add column parts_extra boolean not null default false,
  add column catalog_order int;
create index services_subcategory_idx on public.services (subcategory_id) where deleted_at is null;
create index services_name_idx on public.services using btree (lower(name));

-- ---------------------------------------------------------------- trazabilidad de la carga inicial (solo administración)
create table public.service_import_meta (
  service_id uuid primary key references public.services (id) on delete cascade,
  import_key text not null unique check (char_length(import_key) between 6 and 80),
  source_name text,
  source_url text,
  raw jsonb not null check (pg_column_size(raw) < 16384),
  imported_at timestamptz not null default now()
);
create table public.catalog_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  usage text,
  unique (url)
);
create table public.catalog_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  position int not null,
  rule text not null unique,
  recommendation text not null
);

-- ---------------------------------------------------------------- snapshot comercial (histórico)
create function private.service_snapshot(p_service uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'service_id', s.id, 'name', s.name, 'category', c.name, 'subcategory', sc.name,
    'price_mode', s.price_mode, 'base_price', s.base_price, 'price_unit', s.price_unit, 'price_type_label', s.price_type_label,
    'parts_extra', s.parts_extra, 'requires_diagnosis', s.requires_diagnosis, 'requires_quote', s.requires_quote,
    'includes', s.includes_text, 'excludes', s.excludes_text, 'price_treatment', s.price_treatment,
    'estimated_time', s.estimated_time, 'modality_label', s.modality_label, 'modalities', s.allowed_modalities,
    'captured_at', now())
  from public.services s
  left join public.service_categories c on c.id = s.category_id
  left join public.service_subcategories sc on sc.id = s.subcategory_id
  where s.id = p_service
$$;
grant execute on function private.service_snapshot(uuid) to authenticated, service_role;

alter table public.quote_items add column service_snapshot jsonb;
alter table public.tickets add column service_snapshot jsonb;
alter table public.service_requests add column service_snapshot jsonb;

create function private.snapshot_service_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.service_id is not null and new.service_snapshot is null then
    new.service_snapshot := private.service_snapshot(new.service_id);
  end if;
  return new;
end $$;
create trigger quote_items_snapshot before insert on public.quote_items for each row execute function private.snapshot_service_row();
create trigger tickets_snapshot before insert on public.tickets for each row execute function private.snapshot_service_row();
create trigger service_requests_snapshot before insert on public.service_requests for each row execute function private.snapshot_service_row();

-- Una versión nueva de cotización conserva el snapshot original de cada línea.
create or replace function public.revise_quote(p_quote uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; v_new uuid; v_role public.app_role := private.my_role(); v_ticket_status public.ticket_status;
begin
  if v_role is null or v_role = 'client' or not private.can_manage_quote(p_quote) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if q.status not in ('sent', 'clarification', 'expired') then raise exception 'quote_not_revisable' using errcode = 'P0001'; end if;
  update public.quotes set status = 'superseded' where id = q.id;
  insert into public.quotes (ticket_id, project_id, customer_id, version, supersedes_id, notes, terms, needs_part, created_by)
  values (q.ticket_id, q.project_id, q.customer_id, q.version + 1, q.id, q.notes, q.terms, q.needs_part, auth.uid())
  returning id into v_new;
  insert into public.quote_items (quote_id, position, kind, service_id, product_id, description, qty, unit_price, discount, tax_rate, warranty_days, warranty_kind, service_snapshot)
  select v_new, position, kind, service_id, product_id, description, qty, unit_price, discount, tax_rate, warranty_days, warranty_kind, service_snapshot
  from public.quote_items where quote_id = q.id;
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

-- Precio "Desde": es un MÍNIMO. Quien cotiza puede fijar un valor igual o mayor al del catálogo sin permiso especial
-- (el valor final depende del modelo, el daño y el alcance); por debajo del mínimo sigue exigiendo pricing.override.
create or replace function private.quote_item_before() returns trigger
language plpgsql set search_path = '' as $$
declare v_cat numeric; v_mode public.price_mode; v_qid uuid := coalesce(new.quote_id, old.quote_id);
begin
  if private.quote_status_of(v_qid) is distinct from 'draft' and not private.is_privileged_session() then
    raise exception 'quote_not_editable' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.kind in ('service', 'product') then
    select c.price, c.mode into v_cat, v_mode from private.catalog_price(new.kind, coalesce(new.service_id, new.product_id)) c;
    if v_mode <> 'quote' then
      if new.unit_price is null then
        new.unit_price := v_cat;
      elsif new.unit_price <> v_cat
            and not (private.is_privileged_session() or private.has_permission('pricing.override') or (v_mode = 'from' and new.unit_price >= v_cat)) then
        raise exception 'price_override_forbidden' using errcode = '42501';
      end if;
    end if;
  end if;
  if new.unit_price is null then raise exception 'price_required' using errcode = '23502'; end if;
  return new;
end $$;

-- ---------------------------------------------------------------- eliminación segura
-- Si el servicio tiene historial (cotizaciones, tickets, solicitudes, pedidos, proyectos) se ARCHIVA (desactiva y marca borrado
-- lógico); si no, se elimina físicamente. Devuelve 'deleted' o 'archived'. Siempre auditado.
create function public.delete_service(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_used boolean;
begin
  if not private.has_permission('catalog.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.services where id = p_id) then raise exception 'service_not_found' using errcode = 'P0002'; end if;
  v_used := exists (select 1 from public.quote_items where service_id = p_id)
         or exists (select 1 from public.tickets where service_id = p_id)
         or exists (select 1 from public.service_requests where service_id = p_id)
         or exists (select 1 from public.order_items where service_id = p_id)
         or exists (select 1 from public.digital_projects where service_id = p_id);
  if v_used then
    update public.services set is_active = false, deleted_at = coalesce(deleted_at, now()) where id = p_id;
    perform private.write_audit(auth.uid(), private.my_role()::text, 'service.archived', 'services', p_id::text, '{}'::jsonb);
    return 'archived';
  end if;
  delete from public.services where id = p_id;
  perform private.write_audit(auth.uid(), private.my_role()::text, 'service.deleted', 'services', p_id::text, '{}'::jsonb);
  return 'deleted';
end $$;

create function public.delete_service_category(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_permission('catalog.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.services where category_id = p_id) then raise exception 'category_in_use' using errcode = 'P0001'; end if;
  delete from public.service_categories where id = p_id;
  perform private.write_audit(auth.uid(), private.my_role()::text, 'service_category.deleted', 'service_categories', p_id::text, '{}'::jsonb);
end $$;

create function public.delete_service_subcategory(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_permission('catalog.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.services where subcategory_id = p_id) then raise exception 'subcategory_in_use' using errcode = 'P0001'; end if;
  delete from public.service_subcategories where id = p_id;
  perform private.write_audit(auth.uid(), private.my_role()::text, 'service_subcategory.deleted', 'service_subcategories', p_id::text, '{}'::jsonb);
end $$;

revoke execute on function public.delete_service(uuid), public.delete_service_category(uuid), public.delete_service_subcategory(uuid) from public, anon;
grant execute on function public.delete_service(uuid), public.delete_service_category(uuid), public.delete_service_subcategory(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- RLS y privilegios de las tablas nuevas
alter table public.service_subcategories enable row level security;
alter table public.service_import_meta enable row level security;
alter table public.catalog_sources enable row level security;
alter table public.catalog_pricing_rules enable row level security;

create policy service_subcategories_public_read on public.service_subcategories for select to anon, authenticated using (is_active);
create policy service_subcategories_admin_all on public.service_subcategories for all to authenticated
  using ((select private.has_permission('catalog.manage'))) with check ((select private.has_permission('catalog.manage')));
create policy import_meta_admin_read on public.service_import_meta for select to authenticated using ((select private.is_admin()));
create policy catalog_sources_admin_read on public.catalog_sources for select to authenticated using ((select private.is_admin()));
create policy pricing_rules_admin_read on public.catalog_pricing_rules for select to authenticated using ((select private.is_admin()));

grant select on public.service_subcategories to anon, authenticated;
grant insert, update on public.service_subcategories to authenticated;
grant select on public.service_import_meta, public.catalog_sources, public.catalog_pricing_rules to authenticated;
grant all on public.service_subcategories, public.service_import_meta, public.catalog_sources, public.catalog_pricing_rules to service_role;

create trigger service_subcategories_audit after insert or update or delete on public.service_subcategories
  for each row execute function private.audit_trigger('values');
