-- JERARQUÍA DEFINITIVA · 25 · SUPERADMIN (propietario único) > TECHNICIAN > CLIENT. El rol ADMIN deja de existir.
-- Es un RENOMBRE del valor del enum: las filas existentes (profiles.role, role_permissions.role) conservan UUID, historial, relaciones y
-- auditoría; solo cambia la etiqueta del rol. Las políticas RLS que llaman a private.is_admin()/my_role() se enlazan por OID y siguen
-- funcionando. Idempotente: si ya está aplicada no hace nada.

-- 1) ADMIN → SUPERADMIN (mismo valor interno, nueva etiqueta)
do $$
begin
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'app_role' and e.enumlabel = 'admin') then
    alter type public.app_role rename value 'admin' to 'superadmin';
  end if;
end $$;

-- 2) private.is_admin() → private.is_superadmin() (las políticas se enlazan por OID)
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'is_admin') then
    alter function private.is_admin() rename to is_superadmin;
  end if;
end $$;

-- 3) Las funciones cuyo CÓDIGO menciona el rol 'admin' o llaman a is_admin() se recompilan con los nombres nuevos
--    (comparaciones del enum, etiquetas de auditoría y llamadas a private.is_superadmin()).
do $$
declare r record; v_def text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f'
      and (p.prosrc like '%''admin''%' or p.prosrc like '%is_admin(%')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(replace(v_def, '''admin''', '''superadmin'''), 'private.is_admin(', 'private.is_superadmin(');
    execute v_def;
  end loop;
end $$;

-- 4) Comprobación: no debe quedar ninguna referencia al rol antiguo en el código de las funciones.
do $$
declare n int;
begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname in ('public', 'private') and p.prokind = 'f' and (p.prosrc like '%''admin''%' or p.prosrc like '%is_admin(%');
  if n > 0 then raise exception 'quedan % funciones con el rol admin', n; end if;
end $$;

-- 5) Propietario ÚNICO: a nivel de base de datos no pueden existir dos SUPERADMIN (ni activos ni archivados).
create unique index if not exists profiles_single_superadmin on public.profiles ((role)) where role = 'superadmin';

-- 6) Bootstrap del propietario: solo service_role y una única vez (sustituye a bootstrap_first_admin).
create or replace function public.bootstrap_first_superadmin(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles where role = 'superadmin') then
    raise exception 'superadmin_already_exists' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and is_active and deleted_at is null) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  update public.profiles set role = 'superadmin', onboarding_completed_at = coalesce(onboarding_completed_at, now()), onboarding_step = 6
  where id = p_user_id;
  insert into public.staff_members (profile_id, job_title, created_by) values (p_user_id, 'Propietario', p_user_id)
  on conflict (profile_id) do nothing;
  update public.customers set deleted_at = now() where profile_id = p_user_id;
  perform private.write_audit(p_user_id, 'superadmin', 'superadmin.bootstrapped', 'profiles', p_user_id::text, '{}'::jsonb);
end $$;
revoke execute on function public.bootstrap_first_superadmin(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_first_superadmin(uuid) to service_role;
drop function if exists public.bootstrap_first_admin(uuid);

-- 7) Gestión de personal: el SUPERADMIN solo puede dar de alta/gestionar TÉCNICOS. Nadie puede crear, modificar ni degradar al
--    SUPERADMIN desde la aplicación; el rol de otra persona solo cambia por esta función (servidor) y queda auditado con
--    actor, usuario afectado, rol anterior y rol nuevo.
create or replace function public.admin_provision_staff(
  p_actor uuid, p_user_id uuid, p_role public.app_role, p_full_name text, p_phone text default null, p_title text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old public.app_role;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'superadmin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role <> 'technician' then raise exception 'invalid_role' using errcode = '22023'; end if;
  select role into v_old from public.profiles where id = p_user_id;
  if not found then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  if v_old = 'superadmin' or p_user_id = p_actor then raise exception 'cannot_modify_superadmin' using errcode = '42501'; end if;
  update public.profiles set role = 'technician', full_name = coalesce(nullif(btrim(p_full_name), ''), full_name) where id = p_user_id;
  insert into public.staff_members (profile_id, job_title, phone, created_by)
  values (p_user_id, p_title, p_phone, p_actor)
  on conflict (profile_id) do update set job_title = excluded.job_title, phone = excluded.phone;
  update public.customers c set deleted_at = now()
  where c.profile_id = p_user_id and not exists (select 1 from public.tickets t where t.customer_id = c.id);
  perform private.write_audit(p_actor, 'superadmin', 'staff.provisioned', 'profiles', p_user_id::text, jsonb_build_object('role', 'technician'));
  if v_old <> 'technician' then
    perform private.write_audit(p_actor, 'superadmin', case when v_old = 'client' then 'superadmin.user_created' else 'superadmin.role_changed' end,
      'profiles', p_user_id::text, jsonb_build_object('target_user', p_user_id, 'old_role', v_old, 'new_role', 'technician'));
  end if;
end $$;

create or replace function public.admin_set_user_active(p_actor uuid, p_user_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role public.app_role;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'superadmin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = p_user_id;
  if not found then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  if v_role = 'superadmin' or p_user_id = p_actor then raise exception 'cannot_modify_superadmin' using errcode = '42501'; end if;
  update public.profiles set is_active = p_active where id = p_user_id;
  perform private.write_audit(p_actor, 'superadmin', case when p_active then 'user.activated' else 'user.deactivated' end, 'profiles', p_user_id::text, '{}'::jsonb);
  perform private.write_audit(p_actor, 'superadmin', case when p_active then 'superadmin.user_enabled' else 'superadmin.user_disabled' end,
    'profiles', p_user_id::text, jsonb_build_object('target_user', p_user_id));
end $$;

-- 8) Auditoría de accesos: el SUPERADMIN registra eventos «superadmin.*» y el técnico «staff.*» (lista cerrada, sin datos sensibles).
create or replace function public.log_staff_event(p_event text, p_metadata jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role public.app_role; v_meta jsonb := '{}'::jsonb; k text; v_action text;
begin
  select role into v_role from public.profiles where id = auth.uid() and is_active and deleted_at is null;
  if auth.uid() is null or v_role is null or v_role = 'client' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_event not in ('staff.login', 'staff.mfa_enroll', 'staff.mfa_success', 'staff.mfa_failure', 'staff.logout',
                     'staff.password_changed', 'staff.password_reset', 'staff.session_revoked') then
    raise exception 'invalid_event' using errcode = '22023';
  end if;
  foreach k in array array['method', 'reason', 'scope'] loop
    if jsonb_typeof(p_metadata -> k) = 'string' then v_meta := v_meta || jsonb_build_object(k, left(p_metadata ->> k, 60)); end if;
  end loop;
  v_action := case when v_role = 'superadmin' then 'superadmin.' || substr(p_event, 7) else p_event end;
  perform private.write_audit(auth.uid(), v_role::text, v_action, 'auth', auth.uid()::text, v_meta);
end $$;

create or replace function public.log_admin_event(p_actor uuid, p_event text, p_target uuid default null, p_metadata jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_meta jsonb := '{}'::jsonb; k text;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'superadmin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_event not in ('superadmin.user_created', 'superadmin.user_disabled', 'superadmin.user_enabled', 'superadmin.role_changed',
                     'superadmin.settings_changed', 'superadmin.security_changed', 'superadmin.session_revoked') then
    raise exception 'invalid_event' using errcode = '22023';
  end if;
  foreach k in array array['method', 'reason', 'scope', 'role', 'setting', 'old_role', 'new_role'] loop
    if jsonb_typeof(p_metadata -> k) = 'string' then v_meta := v_meta || jsonb_build_object(k, left(p_metadata ->> k, 60)); end if;
  end loop;
  if p_target is not null then v_meta := v_meta || jsonb_build_object('target_user', p_target); end if;
  perform private.write_audit(p_actor, 'superadmin', p_event, 'profiles', coalesce(p_target, p_actor)::text, v_meta);
end $$;
