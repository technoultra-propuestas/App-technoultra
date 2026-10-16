-- Eliminación definitiva de una cuenta (SOLO superadmin, desde el CRM).
-- Las llaves foráneas del esquema son restrictivas a propósito (conservar historial). Esta función es la ÚNICA vía autorizada para
-- borrar una cuenta con todo lo suyo: recorre las dependencias, guarda una copia completa de lo borrado en `purged_users_archive`
-- (solo service_role) y deja auditoría. No se puede borrar a un superadmin, ni a uno mismo, ni sin escribir el correo exacto.

create table public.purged_users_archive (
  id uuid primary key default gen_random_uuid(),
  purged_at timestamptz not null default now(),
  purged_by uuid not null,
  target_id uuid not null,
  target_email text not null,
  target_role text not null,
  counts jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb
);
alter table public.purged_users_archive enable row level security;
revoke all on public.purged_users_archive from public, anon, authenticated;
grant select, insert on public.purged_users_archive to service_role;

-- Ejecuta una sentencia DML sobre p_rel con sus triggers de usuario (guardas de «solo inserción», máquina de estados…) levantados SOLO durante la
-- sentencia y dentro de la transacción. Las llaves foráneas (triggers del sistema) siguen activas: por eso el recorrido borra hijos antes que padres.
create function private.purge_dml(p_rel regclass, p_sql text, p_ids text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_toggle boolean := p_rel::text not like 'auth.%';
begin
  if v_toggle then execute format('alter table %s disable trigger user', p_rel); end if;
  execute p_sql using p_ids;
  if v_toggle then execute format('alter table %s enable trigger user', p_rel); end if;
end $$;
revoke execute on function private.purge_dml(regclass, text, text[]) from public, anon, authenticated;

-- Recorrido recursivo: borra las filas p_ids de p_rel y, antes, todo lo que depende de ellas.
-- Reglas: hijos de auth.users y de filas que no son perfiles = dependientes (se borran). Hijos de public.profiles: por columna
-- «propia» (profile_id, recipient_id, user_id, signer_profile_id) se borran; por columna de referencia anulable (assigned_to,
-- created_by, …) se desasignan; cualquier otra referencia bloquea (p. ej. quien firmó o autorizó registros de otras personas).
create function private.purge_rows(p_rel regclass, p_ids text[], p_depth int default 0) returns void
language plpgsql security definer set search_path = '' as $$
declare
  fk record; v_pk text; v_child_pk text; v_child_ids text[]; v_n int; v_is_profiles boolean;
  v_own constant text[] := array['profile_id', 'recipient_id', 'user_id', 'signer_profile_id'];
  v_nullify constant text[] := array['assigned_to', 'created_by', 'updated_by', 'triggered_by', 'owner_id', 'approved_by'];
  v_skip_rows constant text[] := array['public.push_subscriptions', 'public.notifications', 'public.notification_preferences', 'public.ai_usage'];
begin
  if cardinality(p_ids) = 0 then return; end if;
  if p_depth > 10 then raise exception 'purge_depth_exceeded'; end if;
  v_is_profiles := p_rel = 'public.profiles'::regclass;
  select a.attname into v_pk from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
   where i.indrelid = p_rel and i.indisprimary and i.indnatts = 1;
  if v_pk is null then raise exception 'purge_no_pk:%', p_rel; end if;

  -- 1) dependientes y referencias
  for fk in
    select c.conrelid::regclass as child, a.attname as col, c.confdeltype as del, a.attnotnull as notnull, cardinality(c.conkey) as ncols
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = p_rel
     order by (case when a.attname = any (v_own) then 0 else 1 end), 1
  loop
    if fk.ncols > 1 then raise exception 'purge_composite_fk:%', fk.child; end if;
    if fk.del = 'n' then
      perform private.purge_dml(fk.child, format('update %s set %I = null where %I::text = any ($1)', fk.child, fk.col, fk.col), p_ids);
    elsif (not v_is_profiles) or fk.col = any (v_own) then
      select a.attname into v_child_pk from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
       where i.indrelid = fk.child and i.indisprimary and i.indnatts = 1;
      if v_child_pk is not null then
        execute format('select coalesce(array_agg(%I::text), array[]::text[]) from %s where %I::text = any ($1)', v_child_pk, fk.child, fk.col)
          into v_child_ids using p_ids;
        perform private.purge_rows(fk.child, v_child_ids, p_depth + 1);
      else
        perform private.purge_dml(fk.child, format('delete from %s where %I::text = any ($1)', fk.child, fk.col), p_ids);
      end if;
    elsif fk.col = any (v_nullify) and not fk.notnull then
      perform private.purge_dml(fk.child, format('update %s set %I = null where %I::text = any ($1)', fk.child, fk.col, fk.col), p_ids);
    else
      execute format('select count(*) from %s where %I::text = any ($1)', fk.child, fk.col) into v_n using p_ids;
      if v_n > 0 then raise exception 'purge_blocked:%:%', fk.child, fk.col using errcode = '23503'; end if;
    end if;
  end loop;

  -- 2) copia de lo que se borra (sin secretos) y borrado
  if p_rel::text not like 'auth.%' or p_rel::text in ('auth.users', 'auth.identities') then
    if not (p_rel::text = any (v_skip_rows)) then
      execute format('insert into pg_temp.purge_rows select %L, jsonb_agg(%s) from %s t where %I::text = any ($1)',
        p_rel::text, case when p_rel::text = 'auth.users' then 'to_jsonb(t) - ''encrypted_password''' else 'to_jsonb(t)' end, p_rel, v_pk) using p_ids;
    end if;
  end if;
  execute format('select count(*) from %s where %I::text = any ($1)', p_rel, v_pk) into v_n using p_ids;
  perform private.purge_dml(p_rel, format('delete from %s where %I::text = any ($1)', p_rel, v_pk), p_ids);
  insert into pg_temp.purge_counts values (p_rel::text, v_n);
end $$;
revoke execute on function private.purge_rows(regclass, text[], int) from public, anon, authenticated;

create function public.admin_purge_user(p_actor uuid, p_target uuid, p_confirm_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role; v_email text; v_counts jsonb; v_snapshot jsonb; v_archive uuid; v_assets jsonb;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'superadmin' and is_active and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_target = p_actor then raise exception 'cannot_purge_self' using errcode = '42501'; end if;
  select role, email into v_role, v_email from public.profiles where id = p_target;
  if not found then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  if v_role = 'superadmin' then raise exception 'cannot_purge_superadmin' using errcode = '42501'; end if;
  if lower(btrim(coalesce(p_confirm_email, ''))) <> lower(v_email) then raise exception 'email_mismatch' using errcode = '22023'; end if;

  create temp table if not exists pg_temp.purge_rows (tbl text, rows jsonb) on commit drop;
  create temp table if not exists pg_temp.purge_counts (tbl text, n int) on commit drop;
  truncate pg_temp.purge_rows, pg_temp.purge_counts;

  -- Las guardas de usuario se levantan solo durante cada sentencia del recorrido; las llaves foráneas siguen activas porque cada
  -- dependiente se borra por completo antes que su padre.
  perform private.purge_rows('auth.users'::regclass, array[p_target::text]);

  select coalesce(jsonb_object_agg(tbl, n), '{}'::jsonb) into v_counts from (select tbl, sum(n)::int n from pg_temp.purge_counts group by tbl) s;
  select coalesce(jsonb_object_agg(tbl, rows), '{}'::jsonb) into v_snapshot from pg_temp.purge_rows where rows is not null;
  select jsonb_build_object(
    'documents', coalesce((select jsonb_agg(r ->> 'storage_path') from pg_temp.purge_rows l, jsonb_array_elements(l.rows) r where l.tbl = 'public.documents' and r ? 'storage_path'), '[]'::jsonb),
    'cloudinary', coalesce((select jsonb_agg(r ->> 'cloudinary_public_id') from pg_temp.purge_rows l, jsonb_array_elements(l.rows) r where r ? 'cloudinary_public_id'), '[]'::jsonb)
  ) into v_assets;

  insert into public.purged_users_archive (purged_by, target_id, target_email, target_role, counts, snapshot)
  values (p_actor, p_target, v_email, v_role::text, v_counts, v_snapshot) returning id into v_archive;
  perform private.write_audit(p_actor, 'superadmin', 'user.purged', 'profiles', p_target::text,
    jsonb_build_object('email', v_email, 'role', v_role, 'archive_id', v_archive, 'counts', v_counts));
  return jsonb_build_object('archive_id', v_archive, 'counts', v_counts, 'assets', v_assets);
end $$;
revoke execute on function public.admin_purge_user(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_purge_user(uuid, uuid, text) to service_role;
