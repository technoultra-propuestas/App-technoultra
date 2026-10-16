-- Revierte la migración 46 (eliminación definitiva de cuentas). La copia `purged_users_archive` solo se elimina si está vacía:
-- si ya contiene copias de cuentas borradas, consérvala (expórtala) antes de retirarla a mano.
drop function if exists public.admin_purge_user(uuid, uuid, text);
drop function if exists private.purge_rows(regclass, text[], int);
drop function if exists private.purge_dml(regclass, text, text[]);
do $$ begin
  if (select count(*) from public.purged_users_archive) = 0 then drop table public.purged_users_archive; end if;
end $$;
-- después: delete from supabase_migrations.schema_migrations where version = '20261016000046';
