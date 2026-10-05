-- ACCESO DEL PERSONAL · 24 · MFA (TOTP de Supabase Auth) obligatorio a nivel de BASE DE DATOS + auditoría de accesos.
-- La autoridad del segundo factor es Supabase Auth: el JWT lleva el claim `aal` ("aal2" solo tras verificar un factor TOTP).
-- No se guarda ningún secreto TOTP, contraseña ni código en nuestras tablas.

-- 1) Rol efectivo: el personal (técnico/admin) SOLO tiene rol con una sesión AAL2. Con AAL1 (solo contraseña, enlace de recuperación,
--    Google…) private.my_role() devuelve NULL, y como todas las políticas RLS y funciones usan my_role()/is_admin()/is_staff()/
--    has_permission(), una sesión sin MFA no puede leer ni escribir nada de gestión aunque la app tuviera un fallo.
--    Los clientes no necesitan MFA. (Su propio perfil sigue visible por la política profiles_self.)
create or replace function private.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.is_active and p.deleted_at is null
    and (p.role = 'client' or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
$$;

-- 2) Auditoría de eventos de acceso del propio personal (con o sin MFA completo: el fallo de MFA ocurre en AAL1).
--    Lista cerrada de eventos y de claves de metadatos; nunca se guardan contraseñas, códigos ni tokens.
create function public.log_staff_event(p_event text, p_metadata jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role public.app_role; v_meta jsonb := '{}'::jsonb; k text;
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
  perform private.write_audit(auth.uid(), v_role::text, p_event, 'auth', auth.uid()::text, v_meta);
end $$;
revoke execute on function public.log_staff_event(text, jsonb) from public, anon;
grant execute on function public.log_staff_event(text, jsonb) to authenticated, service_role;

-- Eventos administrativos del servidor (invitaciones, cambios de seguridad…). Solo service_role y con un administrador activo como actor.
create function public.log_admin_event(p_actor uuid, p_event text, p_target uuid default null, p_metadata jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_meta jsonb := '{}'::jsonb; k text;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_event not in ('admin.user_created', 'admin.user_disabled', 'admin.user_enabled', 'admin.role_changed', 'admin.settings_changed',
                     'admin.security_changed', 'staff.session_revoked') then
    raise exception 'invalid_event' using errcode = '22023';
  end if;
  foreach k in array array['method', 'reason', 'scope', 'role', 'setting'] loop
    if jsonb_typeof(p_metadata -> k) = 'string' then v_meta := v_meta || jsonb_build_object(k, left(p_metadata ->> k, 60)); end if;
  end loop;
  perform private.write_audit(p_actor, 'admin', p_event, 'profiles', coalesce(p_target, p_actor)::text, v_meta);
end $$;
revoke execute on function public.log_admin_event(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.log_admin_event(uuid, text, uuid, jsonb) to service_role;

-- 3) Gestión de personal más estricta (siempre en servidor, con actor admin verificado y auditoría):
--    · nadie cambia su propio rol ni deja al sistema sin administradores;
--    · se registran admin.user_created / admin.role_changed además del evento histórico staff.provisioned.
create or replace function public.admin_provision_staff(
  p_actor uuid, p_user_id uuid, p_role public.app_role, p_full_name text, p_phone text default null, p_title text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old public.app_role;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('technician', 'admin') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select role into v_old from public.profiles where id = p_user_id;
  if not found then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  if p_user_id = p_actor and p_role <> v_old then raise exception 'cannot_change_own_role' using errcode = '22023'; end if;
  if v_old = 'admin' and p_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin' and is_active and deleted_at is null and id <> p_user_id) = 0 then
    raise exception 'last_admin' using errcode = '22023';
  end if;
  update public.profiles set role = p_role, full_name = coalesce(nullif(btrim(p_full_name), ''), full_name) where id = p_user_id;
  insert into public.staff_members (profile_id, job_title, phone, created_by)
  values (p_user_id, p_title, p_phone, p_actor)
  on conflict (profile_id) do update set job_title = excluded.job_title, phone = excluded.phone;
  update public.customers c set deleted_at = now()
  where c.profile_id = p_user_id and not exists (select 1 from public.tickets t where t.customer_id = c.id);
  perform private.write_audit(p_actor, 'admin', 'staff.provisioned', 'profiles', p_user_id::text, jsonb_build_object('role', p_role));
  perform private.write_audit(p_actor, 'admin', case when v_old = 'client' then 'admin.user_created' else 'admin.role_changed' end,
    'profiles', p_user_id::text, jsonb_build_object('role', p_role));
end $$;

create or replace function public.admin_set_user_active(p_actor uuid, p_user_id uuid, p_active boolean) returns void
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
  perform private.write_audit(p_actor, 'admin', case when p_active then 'admin.user_enabled' else 'admin.user_disabled' end,
    'profiles', p_user_id::text, '{}'::jsonb);
end $$;
