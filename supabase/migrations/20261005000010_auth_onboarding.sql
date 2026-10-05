-- FASE 2 · 10 · Limitador de intentos (por clave) y estado de onboarding persistente en backend.

-- Ventana fija por clave (p. ej. 'login:ip:1.2.3.4'). Solo el servidor (service_role) lo invoca.
create table private.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits int not null default 0
);

create function public.check_rate_limit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_hits int;
begin
  if p_key is null or char_length(p_key) > 200 or p_max < 1 or p_window_seconds < 1 then
    raise exception 'invalid_rate_limit_args' using errcode = '22023';
  end if;
  insert into private.rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;
revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

-- Limpieza de ventanas vencidas (se invoca desde un cron del servidor).
create function public.purge_rate_limits() returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  delete from private.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.purge_rate_limits() from public, anon, authenticated;
grant execute on function public.purge_rate_limits() to service_role;

-- Onboarding reanudable: el paso vive en el backend, no en localStorage.
alter table public.profiles
  add column onboarding_step smallint not null default 0 check (onboarding_step between 0 and 6);
grant update (onboarding_step) on public.profiles to authenticated;

-- Finalizar el onboarding exige cumplir requisitos en servidor (no basta con enviar la marca de tiempo).
create function public.complete_onboarding() returns void
language plpgsql security definer set search_path = '' as $$
declare v_cust public.customers%rowtype; v_missing text[];
begin
  if auth.uid() is null or private.my_role() is distinct from 'client' then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_cust from public.customers where profile_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'customer_not_found' using errcode = 'P0002'; end if;
  if v_cust.phone is null then v_missing := array_append(v_missing, 'phone'); end if;
  -- documentos legales publicados que exigen aceptación
  select array_agg(l.slug) into v_missing
  from (select unnest(coalesce(v_missing, '{}')) as slug
        union all
        select ld.slug from public.legal_documents ld
        where ld.status = 'published' and ld.requires_acceptance
          and not exists (select 1 from public.legal_acceptances a where a.legal_document_id = ld.id and a.profile_id = auth.uid())) l;
  if v_missing is not null and cardinality(v_missing) > 0 then
    raise exception 'onboarding_incomplete: %', array_to_string(v_missing, ',') using errcode = 'P0001';
  end if;
  update public.profiles set onboarding_completed_at = now(), onboarding_step = 6 where id = auth.uid();
  perform private.write_audit(auth.uid(), 'client', 'onboarding.completed', 'profiles', auth.uid()::text, '{}'::jsonb);
end $$;
revoke execute on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated, service_role;

-- La marca de finalización ya no puede escribirse directamente: solo vía complete_onboarding().
revoke update (onboarding_completed_at) on public.profiles from authenticated;
grant update (full_name, avatar_url, onboarding_step) on public.profiles to authenticated;

-- Aceptaciones legales pendientes del usuario actual (documentos publicados que exigen aceptación).
create function public.pending_legal_documents() returns table (id uuid, slug text, version int, title text)
language sql stable security definer set search_path = '' as $$
  select ld.id, ld.slug, ld.version, ld.title from public.legal_documents ld
  where auth.uid() is not null and ld.status = 'published' and ld.requires_acceptance
    and not exists (select 1 from public.legal_acceptances a where a.legal_document_id = ld.id and a.profile_id = auth.uid())
  order by ld.slug
$$;
revoke execute on function public.pending_legal_documents() from public, anon;
grant execute on function public.pending_legal_documents() to authenticated;

-- Bootstrap seguro del PRIMER administrador: solo service_role, una única vez (falla si ya existe uno activo).
create function public.bootstrap_first_admin(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles where role = 'admin' and deleted_at is null) then
    raise exception 'admin_already_exists' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and is_active and deleted_at is null) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  update public.profiles set role = 'admin', onboarding_completed_at = coalesce(onboarding_completed_at, now()), onboarding_step = 6
  where id = p_user_id;
  insert into public.staff_members (profile_id, job_title, created_by) values (p_user_id, 'Administrador', p_user_id)
  on conflict (profile_id) do nothing;
  update public.customers set deleted_at = now() where profile_id = p_user_id;
  perform private.write_audit(p_user_id, 'admin', 'admin.bootstrapped', 'profiles', p_user_id::text, '{}'::jsonb);
end $$;
revoke execute on function public.bootstrap_first_admin(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_first_admin(uuid) to service_role;
