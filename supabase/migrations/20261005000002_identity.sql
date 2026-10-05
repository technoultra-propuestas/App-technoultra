-- FASE 1 · 02 · Identidad: perfiles, clientes, personal, direcciones, permisos y funciones de autorización.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  role public.app_role not null default 'client',
  email text not null check (email = lower(email)),
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  is_active boolean not null default true,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index profiles_email_key on public.profiles (email) where deleted_at is null;
create index profiles_role_idx on public.profiles (role) where deleted_at is null;
create trigger profiles_updated before update on public.profiles for each row execute function private.set_updated_at();

-- Cliente = ficha comercial. profile_id es nulo para clientes de mostrador (sin cuenta) y se vincula luego.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  phone text check (phone is null or phone ~ '^[0-9]{10}$'),
  email text check (email is null or email = lower(email)),
  document_type text check (document_type in ('CC', 'CE', 'NIT', 'PP', 'TI')),
  document_number text check (document_number is null or document_number ~ '^[0-9A-Za-z-]{5,20}$'),
  company_name text check (company_name is null or char_length(company_name) <= 160),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((document_type is null) = (document_number is null))
);
create unique index customers_phone_key on public.customers (phone) where phone is not null and deleted_at is null;
create unique index customers_document_key on public.customers (document_type, document_number)
  where document_number is not null and deleted_at is null;
create index customers_name_idx on public.customers (lower(full_name));
create trigger customers_updated before update on public.customers for each row execute function private.set_updated_at();

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete restrict,
  job_title text check (job_title is null or char_length(job_title) <= 80),
  phone text check (phone is null or phone ~ '^[0-9]{10}$'),
  is_available boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger staff_updated before update on public.staff_members for each row execute function private.set_updated_at();

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  label text not null default 'Casa' check (char_length(label) <= 40),
  line1 text not null check (char_length(btrim(line1)) between 3 and 160),
  line2 text check (line2 is null or char_length(line2) <= 160),
  neighborhood text check (neighborhood is null or char_length(neighborhood) <= 100),
  city_name text not null check (char_length(city_name) between 2 and 80),
  department text not null check (char_length(department) between 2 and 80),
  dane_code text not null check (dane_code ~ '^[0-9]{5}$'),
  country_code char(2) not null default 'CO' check (country_code = 'CO'),
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  notes text check (notes is null or char_length(notes) <= 300),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index addresses_customer_idx on public.addresses (customer_id) where deleted_at is null;
create unique index addresses_one_default on public.addresses (customer_id) where is_default and deleted_at is null;
create trigger addresses_updated before update on public.addresses for each row execute function private.set_updated_at();

-- Permisos granulares (preparado para crecer). El rol admin tiene todos implícitamente.
create table public.permissions (
  code text primary key check (code ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null
);
create table public.role_permissions (
  role public.app_role not null,
  permission_code text not null references public.permissions (code) on delete cascade,
  primary key (role, permission_code)
);

-- ---------------------------------------------------------------- autorización (SECURITY DEFINER: evita recursión RLS)
-- Se consulta SIEMPRE la base de datos; nunca el JWT ni metadatos editables por el usuario.
create function private.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active and p.deleted_at is null
$$;
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select coalesce(private.my_role() = 'admin', false) $$;
create function private.is_technician() returns boolean
language sql stable security definer set search_path = '' as $$ select coalesce(private.my_role() = 'technician', false) $$;
create function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$ select coalesce(private.my_role() in ('technician', 'admin'), false) $$;
create function private.my_customer_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.customers c
  where c.profile_id = auth.uid() and c.deleted_at is null and private.my_role() = 'client'
$$;
create function private.has_permission(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() = 'admin', false) or exists (
    select 1 from public.role_permissions rp where rp.role = private.my_role() and rp.permission_code = p_code)
$$;

-- ---------------------------------------------------------------- alta de usuarios
-- Todo usuario que se registra (email o Google) nace como CLIENTE. El rol NUNCA se lee de metadatos del usuario.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 120);
begin
  if new.email is null or btrim(new.email) = '' then raise exception 'email_required' using errcode = '23514'; end if;
  insert into public.profiles (id, role, email, full_name, avatar_url)
  values (new.id, 'client', lower(btrim(new.email)), v_name, left(nullif(new.raw_user_meta_data ->> 'avatar_url', ''), 500));
  insert into public.customers (profile_id, full_name, email, created_by)
  values (new.id, coalesce(nullif(v_name, ''), split_part(lower(new.email), '@', 1)), lower(btrim(new.email)), new.id);
  perform private.write_audit(new.id, 'client', 'auth.user_created', 'profiles', new.id::text, '{}'::jsonb);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create function private.sync_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = lower(btrim(new.email)) where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users for each row execute function private.sync_user_email();

-- Anti-escalada: nadie (salvo funciones de este proyecto / service_role) cambia rol, estado, correo o identidad.
create function private.guard_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id, new.role, new.is_active, new.email, new.deleted_at) is distinct from (old.id, old.role, old.is_active, old.email, old.deleted_at)
     and not private.is_privileged_session() then
    raise exception 'privileged_column' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function private.guard_profile();

-- El cliente no puede reasignar su ficha a otro perfil ni manipular el creador.
create function private.guard_customer() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id, new.profile_id, new.created_by) is distinct from (old.id, old.profile_id, old.created_by)
     and not private.is_privileged_session() then
    raise exception 'privileged_column' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger customers_guard before update on public.customers for each row execute function private.guard_customer();

-- ---------------------------------------------------------------- gestión de personal (solo service_role)
-- El servidor valida primero que el solicitante sea administrador (getUser + rol) y llama estas funciones.
create function public.admin_provision_staff(
  p_actor uuid, p_user_id uuid, p_role public.app_role, p_full_name text, p_phone text default null, p_title text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('technician', 'admin') then raise exception 'invalid_role' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  update public.profiles set role = p_role, full_name = coalesce(nullif(btrim(p_full_name), ''), full_name) where id = p_user_id;
  insert into public.staff_members (profile_id, job_title, phone, created_by)
  values (p_user_id, p_title, p_phone, p_actor)
  on conflict (profile_id) do update set job_title = excluded.job_title, phone = excluded.phone;
  -- el personal no es cliente: se archiva su ficha de cliente automática si no tiene historial
  update public.customers c set deleted_at = now()
  where c.profile_id = p_user_id and not exists (select 1 from public.tickets t where t.customer_id = c.id);
  perform private.write_audit(p_actor, 'admin', 'staff.provisioned', 'profiles', p_user_id::text, jsonb_build_object('role', p_role));
end $$;

create function public.admin_set_user_active(p_actor uuid, p_user_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not p_active and p_user_id = p_actor then raise exception 'cannot_deactivate_self' using errcode = '22023'; end if;
  if not p_active and (select role from public.profiles where id = p_user_id) = 'admin'
     and (select count(*) from public.profiles where role = 'admin' and is_active and deleted_at is null and id <> p_user_id) = 0 then
    raise exception 'last_admin' using errcode = '22023';
  end if;
  update public.profiles set is_active = p_active where id = p_user_id;
  perform private.write_audit(p_actor, 'admin', case when p_active then 'user.activated' else 'user.deactivated' end,
    'profiles', p_user_id::text, '{}'::jsonb);
end $$;

insert into public.permissions (code, description) values
  ('tickets.manage', 'Crear y gestionar tickets'),
  ('tickets.diagnose', 'Registrar diagnósticos y pruebas'),
  ('quotes.manage', 'Crear y enviar cotizaciones'),
  ('pricing.override', 'Modificar precios en cotizaciones respecto al catálogo'),
  ('catalog.manage', 'Administrar catálogo, productos e inventario'),
  ('payments.confirm_manual', 'Confirmar pagos manuales'),
  ('users.manage', 'Administrar usuarios y roles'),
  ('legal.manage', 'Publicar documentos legales'),
  ('crm.manage', 'Gestionar CRM y agenda'),
  ('reports.view', 'Ver reportes');
insert into public.role_permissions (role, permission_code) values
  ('technician', 'tickets.diagnose'), ('technician', 'quotes.manage');
