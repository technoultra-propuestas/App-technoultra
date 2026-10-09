#!/usr/bin/env bash
# Volcado de la base de datos de TechnoUltra (Supabase) en formato personalizado de PostgreSQL.
# Uso:  SUPABASE_DB_URL='postgresql://postgres.<ref>:<clave>@aws-0-us-west-2.pooler.supabase.com:5432/postgres' scripts/backup/dump-db.sh <carpeta>
# Requiere pg_dump >= 17 (el servidor es PostgreSQL 17). En CI se usa la imagen oficial postgres:17 (ver el flujo backup.yml).
#
# Qué incluye: esquemas public (datos de la app), private (funciones y reglas de negocio), auth (usuarios, identidades, factores MFA),
# storage (metadatos de los archivos) y supabase_migrations (historial de migraciones).
# Qué NO incluye (se regenera solo y pesa mucho): bitácora técnica de Auth, sesiones, refresh tokens y retos MFA en curso.
set -euo pipefail
: "${SUPABASE_DB_URL:?Falta SUPABASE_DB_URL}"
OUT="${1:-backup}"
mkdir -p "$OUT"

pg_dump "$SUPABASE_DB_URL" \
  --format=custom --no-owner --no-privileges \
  --schema=public --schema=private --schema=auth --schema=storage --schema=supabase_migrations \
  --exclude-table-data=auth.audit_log_entries \
  --exclude-table-data=auth.refresh_tokens \
  --exclude-table-data=auth.sessions \
  --exclude-table-data=auth.flow_state \
  --exclude-table-data=auth.one_time_tokens \
  --exclude-table-data=auth.mfa_challenges \
  --exclude-table-data=auth.mfa_amr_claims \
  --file="$OUT/db.dump"

# Comprobación mínima de que el archivo es legible y completo.
pg_restore --list "$OUT/db.dump" > "$OUT/db.toc"
ENTRIES=$(wc -l < "$OUT/db.toc")
SIZE=$(wc -c < "$OUT/db.dump")
echo "db.dump: ${SIZE} bytes, ${ENTRIES} entradas"
if [ "$SIZE" -lt 200000 ] || [ "$ENTRIES" -lt 500 ]; then
  echo "ERROR: el volcado es sospechosamente pequeño (¿conexión equivocada o base vacía?)" >&2
  exit 1
fi
