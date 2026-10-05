# Progreso

## Fase actual: FASE 1 — Supabase + seguridad (esquema, RLS, auditoría, máquina de estados)

### Hecho (verificado con 48 pruebas automáticas sobre Postgres 17)

- 9 migraciones versionadas en `supabase/migrations/` (55 tablas con RLS, 0 sin RLS).
- Identidad y roles (`client` / `technician` / `admin`), alta segura (todo registro = cliente), anti-escalada de privilegios.
- Cobertura geográfica configurable (Cali, Palmira, Jamundí, Yumbo) validada por trigger en base de datos; soporte remoto nacional.
- Catálogo, inventario con libro mayor inmutable, cotizaciones con precio de catálogo obligatorio y totales calculados en BD.
- Máquina de estados de tickets (matriz `ticket_transitions` + precondiciones) con historial inmutable y auditoría.
- Garantías (producto/trabajo), plan de mantenimiento, tarea CRM y evento de agenda al entregar.
- Pagos solo-servidor (estado final inmutable, eventos idempotentes), documentos con hash y firma que bloquea modificaciones.
- Legal versionado (hash calculado en BD, versión publicada inmutable) y aceptación inmutable.
- Auditoría insert-only con cadena de hashes verificable (`private.verify_audit_chain()`).
- Arnés de pruebas `tests/db/` (PGlite + emulación de roles/`auth` de Supabase).

### Pendiente de esta fase

- Aplicar las migraciones al proyecto remoto `agosikmonvjujxzokdlc` (requiere `SUPABASE_DB_PASSWORD`; ver abajo).
- Aplicar la configuración de Auth remota (`supabase config push`) y desactivar GraphQL expuesto en el panel.
- Generar tipos TypeScript (`supabase gen types`) tras aplicar.
- Revisión final con skills de seguridad (zero-trust / database review).

### Bloqueo actual

La CLI no puede abrir un rol temporal en la base remota (401) → necesita `SUPABASE_DB_PASSWORD`.
Cree/actualice `.env.local` (ignorado por git) con esa variable; no la pegue en el chat.

### Validaciones

typecheck OK · lint OK · tests 48/48 · build (ver último commit).
