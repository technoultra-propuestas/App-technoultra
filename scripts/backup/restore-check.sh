#!/usr/bin/env bash
# PRUEBA DE RESTAURACIÓN en un PostgreSQL 17 desechable (Docker): comprueba que una copia sirve de verdad.
# Uso:  scripts/backup/restore-check.sh technoultra-AAAA-MM-DD.tar.gz.gpg      (pide la frase de cifrado)
#       scripts/backup/restore-check.sh ruta/a/db.dump                           (si ya está descifrada)
# No toca Supabase ni ninguna base real: crea y destruye un contenedor local.
set -euo pipefail
SRC="${1:?Indica el archivo .gpg o el db.dump}"
WORK="$(mktemp -d)"
trap 'docker rm -f tu-restore-check >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

if [[ "$SRC" == *.gpg ]]; then
  gpg --output "$WORK/copia.tar.gz" --decrypt "$SRC"
  tar xzf "$WORK/copia.tar.gz" -C "$WORK"
  DUMP="$WORK/db.dump"
else
  DUMP="$SRC"
fi

docker run -d --name tu-restore-check -e POSTGRES_PASSWORD=x postgres:17 >/dev/null
for _ in $(seq 1 30); do docker exec tu-restore-check pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
# Roles y extensiones que Supabase ya trae en un proyecto nuevo.
docker exec -i tu-restore-check psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role supabase_auth_admin nologin; create role supabase_storage_admin nologin; create role authenticator nologin; create role dashboard_user nologin;
create schema if not exists extensions; create extension if not exists pgcrypto schema extensions; create extension if not exists pg_trgm schema extensions;
SQL
docker cp "$DUMP" tu-restore-check:/db.dump
# `schema public already exists` es normal (viene creado de fábrica); cualquier otro error se muestra.
docker exec tu-restore-check pg_restore -U postgres --no-owner --no-privileges --dbname=postgres /db.dump 2>&1 | grep -v 'schema "public" already exists' | grep 'error:' || true
echo "--- contenido restaurado ---"
docker exec -i tu-restore-check psql -U postgres -tA <<'SQL'
select 'tablas en public: ' || count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';
select 'clientes: ' || count(*) from public.customers;
select 'tickets: ' || count(*) from public.tickets;
select 'productos: ' || count(*) from public.products;
select 'documentos: ' || count(*) from public.documents;
select 'usuarios (auth): ' || count(*) from auth.users;
select 'migraciones: ' || count(*) from supabase_migrations.schema_migrations;
SQL
