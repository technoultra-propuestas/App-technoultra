# Progreso

Última actualización: 2026-10-05. Commit de referencia: ver `git log` en `main`.

## Resumen de estado

| Área | Estado |
|---|---|
| Base de datos (20 migraciones) | **Aplicada al Supabase remoto `agosikmonvjujxzokdlc` (2026-10-05)** y verificada: 55 tablas con RLS, 104 políticas (0 con `USING true`), funciones administrativas cerradas a `anon`/`authenticated`, bucket privado `documents`, cobertura Cali/Palmira/Jamundí/Yumbo, cadena de auditoría íntegra. |
| Auth (correo + código, Google OAuth, staff por invitación) | Implementada y probada con pruebas automáticas. **No probada contra Supabase/Google reales.** |
| Onboarding persistente + aceptación legal versionada | Implementado. |
| Servicios, cobertura (Cali/Palmira/Jamundí/Yumbo + remoto nacional), equipos, direcciones, solicitudes | Implementado (cobertura validada en BD). |
| Tickets (9 estados), recepción con fotos (Cloudinary), diagnóstico, checklist, cotizaciones, entrega, garantías, mantenimiento/CRM | Implementado. Cloudinary sin credenciales aún. |
| IA (Gemini) preliminar + validación humana | Implementada. Clave en el entorno del equipo; no probada contra Gemini. |
| Documentos PDF + firma manuscrita + descarga segura | Implementado (bucket privado de Supabase Storage). |
| Tienda + pedidos + Mercado Pago (webhook verificado/idempotente) + pagos manuales | Implementado. **Sin credenciales de Mercado Pago aún.** |
| CRM, agenda, proyectos digitales, reportes, avisos, correos (Resend) | Implementado. |
| PWA (manifest, SW seguro, offline, safe-areas), SEO (sitemap, robots, JSON-LD, páginas locales) | Implementado. |
| Pruebas | 191 automáticas (unitarias + base de datos). typecheck ✓ lint ✓ build ✓. |

## Fases
- **Fase 0** base · **Fase 1** BD+seguridad · **Fase 2** auth+onboarding · **Fase 3** servicios/cobertura/solicitudes · **Fase 5** recepción/evidencia/diagnóstico/checklist/IA · **Fase 6** cotizaciones · **Fase 7** servicio/entrega/garantías/mantenimiento · **Fase 8** pagos · **Fase 9** tienda · **Fase 10** documentos/firma/legal · **Fase 11** CRM/agenda/avisos/correo · **Fase 12** PWA · **Fase 13** proyectos digitales · **Fase 14** SEO/rendimiento/endurecimiento (parcial): hechas en código.
- **Fase 15** QA/lanzamiento: **pendiente** (requiere entorno real: ver bloqueos y lista de go-live).

## BLOQUEOS que requieren acción del propietario
1. **`.env.local` está vacío (0 bytes)** en disco. Faltan: `SUPABASE_DB_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`. Sin esto no se pueden aplicar las migraciones al remoto ni ejecutar la app contra Supabase.
2. La CLI de Supabase devuelve 401 al abrir el rol temporal / leer claves con el token de login actual.
3. Google OAuth: ver `docs/GOOGLE_OAUTH.md`.
4. Resend (SMTP de Auth + API key), Cloudinary, Mercado Pago, Gemini: credenciales por cargar en Vercel/Supabase (ver `docs/DEPLOYMENT.md`).
5. Textos legales reales (revisión por abogado colombiano) y primer administrador (`scripts/bootstrap-admin.mjs`).
6. Plan de Supabase con copias de seguridad (Pro) antes de producción.

## Pendientes técnicos conocidos
- Aplicar migraciones al remoto y verificar (`supabase db push`), generar tipos TS (`supabase gen types`) y tipar las consultas.
- Pruebas E2E (Playwright) contra un entorno real; pruebas de carga del limitador y de la cadena de auditoría.
- Web Push (VAPID), WhatsApp, y creación automática de ticket de instalación al pagar un pedido (hoy se marca `needs_installation` y administración lo gestiona).
- Catálogo completo de municipios DANE (hoy: coberturas configuradas + "otra ciudad" = solo remoto).
- Imágenes de productos/servicios (Cloudinary) en tienda y catálogo; archivos de proyectos digitales.
- Política de retención escrita (la supresión ya existe: `anonymize_customer` + /b/privacidad; migración 21 pendiente de aplicar al remoto).

## Catálogo oficial (2026-10-05)
Migración 20, importador validado (161 servicios/13 categorías), CRM ampliado (filtros, subcategorías, historial, eliminación segura), catálogo público con subcategorías y precio "Desde"/"+ repuesto". Detalle en `docs/CATALOGO_IMPORTACION.md`.
**Estado remoto verificado (2026-10-05):** migración 20 aplicada; 161 servicios, 13 categorías, 107 subcategorías, 41 con diagnóstico, 34 "Desde", 15 "+ repuesto", RLS activo y sin duplicados. Producción (app.technoultra.com y app-technoultra.vercel.app) responde 200; variables de Vercel cargadas por el propietario; redirectTo de Google exacto `/auth/callback`.

## Configuración comercial (2026-10-05)
IVA configurable, recargo por urgencia, domicilio, crédito de diagnóstico y snapshots (migración 22), consolidación del duplicado "Diagnóstico de red" (migración 23), pantalla `/b/comercial`, desglose en cotización (cliente, personal y PDF). Detalle en `docs/DECISIONS.md` D-050…D-055. **Migraciones 21, 22 y 23 pendientes de aplicar al remoto** (`supabase db push`); no desplegar el código antes (las pantallas de ticket usan las columnas nuevas).

## Migraciones 21–23 y verificación de correo (2026-10-05)
Migraciones 21, 22 y 23 aplicadas al remoto y verificadas (RLS, grants, tarifas, niveles de urgencia inactivos en 0 %, duplicado archivado). Flujo de registro probado de punta a punta en producción (registro → correo con enlace → callback → onboarding; enlace usado → aviso; volver a `/verificar` y refresh) con un buzón desechable y limpieza posterior del usuario de prueba. Onboarding responsive validado en 9 tamaños (360×800 … 1920×1080) sin overflow horizontal.

## Acceso del personal con MFA (2026-10-05)
Portal `/gestion/*` con TOTP obligatorio (migración 24 aplicada), `/b/seguridad`, alta/recuperación seguras y auditoría de accesos. Probado en producción de punta a punta (88 comprobaciones, incluidas RLS con JWT aal1/aal2 reales). **La cuenta administradora real debe configurar su autenticador en el próximo ingreso** (`/gestion/login`). Ver `docs/ACCESO-Y-MFA.md`.

## Jerarquía SUPERADMIN (2026-10-05)
Migración 25: `admin` → `superadmin` (propietario único), `is_admin` → `is_superadmin`, índice de propietario único, alta de personal solo técnicos, auditoría `superadmin.*`. Ver `docs/ACCESO-Y-MFA.md` y D-065…D-067.

## E2E en el repositorio, observabilidad y tipos (2026-10-05)
- `tests/e2e/` (ver su README): cuatro escenarios sobre la pila local de Supabase (puertos 563xx) con Chrome real, Mailpit, TOTP real, **Cloudinary real** (subida firmada y verificada) y **Gemini real** (aviso obligatorio): registro y onboarding; MFA y roles del personal; cadena completa CLIENTE → SOLICITUD → TICKET → RECEPCIÓN → FOTOS → DIAGNÓSTICO → COTIZACIÓN → APROBACIÓN → PAGO → SERVICIO → PRUEBAS → ENTREGA → GARANTÍA → MANTENIMIENTO; y 60 comprobaciones de seguridad con sesiones reales (escalada, aislamiento, MFA en BD, inmutabilidad). Comandos: `npm run e2e:setup`, `npm run e2e`, `npm run e2e:reset`.
- Defecto real hallado por el E2E y corregido: el botón «Ver diagnóstico preliminar con IA» reiniciaba el formulario y borraba lo escrito (campos de la solicitud ahora controlados).
- Observabilidad sin dependencias (`src/instrumentation.ts` + `src/lib/observability.ts`): registro JSON depurado (sin correos, JWT, claves, identificadores ni query) y envío a Sentry solo si existe `SENTRY_DSN`.
- Tipos de Supabase generados desde el remoto (`src/lib/supabase/database.types.ts`) y aplicados a los tres clientes (servidor, admin, público). Regenerar tras cada migración con `supabase gen types typescript --db-url <url> --schema public`.
- Plantillas de correo locales (`supabase/templates`) alineadas con producción (por enlace).

## Rediseño UX/UI — fase 1 (2026-10-06)
Auditoría (`docs/UX-REDESIGN-AUDIT.md`) y primera entrega (`docs/UX-REDESIGN-COMPLETE.md`): riel + cabecera + barra inferior comunes a personal y cliente, kit de componentes, Inicio/Tickets/Clientes/Cotizaciones/Agenda (Día-Semana-Mes)/CRM (tablero)/Tienda/Avisos/Más del panel y «Lo que sigue» del cliente. Escenario E2E `05-panel-ux` (130 comprobaciones). Pendiente: el resto de pantallas listadas en el documento.

## Corrección «Enviar al cliente» y manifest (2026-10-06)
- **Causa:** el ticket TU-2026-00001 estaba en «Recibido»; `send_quote` (supabase/migrations/20261005000011_quote_workflow.sql, línea 30) lo pasa a «Esperando aprobación», transición que solo existe desde «En diagnóstico» → `invalid_transition: received -> awaiting_approval`. La acción (`src/app/b/tickets/quote-actions.ts`) lo traducía al mensaje genérico. Los importes (70.000 − 39.900 = 30.100) estaban correctos.
- **Corrección:** mensaje claro con el estado actual; botón deshabilitado con explicación si el ticket no está en diagnóstico; errores desconocidos con referencia («Ref. xxxxxxxx») y registro/Sentry depurado (`reportActionError`). La máquina de estados y las reglas comerciales no cambian.
- **Pruebas:** `tests/db/quote-send-regression.test.ts` (escenario exacto + doble clic + permisos + ticket en «Recibido»), `tests/unit/quote-send-action.test.ts`, E2E `06-cotizacion-estado`.
- **Manifest:** `/manifest.webmanifest` es público (excluido del proxy) y responde 200 con `application/manifest+json`; el `ERR_TIMED_OUT` es intermitente de red (también falló `/` y la conexión IPv6 a la BD desde esta máquina), no de la ruta. Se añade `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` para no repetir la petición en cada carga. E2E lo verifica.
- **IA:** proveedor `AI_PROVIDER=openrouter` soportado (`src/lib/ai/llm.ts`); Gemini sigue como alternativa.

## Mercado Pago → Checkout Pro + Orders API (2026-10-07)
Migración completa de Preferences/`payment` heredado a Orders API (ver `docs/MERCADOPAGO.md`): `createOrder`/`fetchOrder`/`cancelOrder`, webhook de tipo `order` (firma, consulta a la API, aplicación/moneda/monto/referencia, idempotencia, estados monótonos), conciliación por id de Order y cancelación de Orders vencidas. Verificado contra la API real (crear 201, consultar 200, cancelar 200; sin cobros). Hallazgos de la API: importes COP sin decimales y ítems sin `total_amount`/`unit_measure`. Sin cambios de esquema (la base ya era agnóstica del proveedor). Pendiente: webhook productivo con evento «Order (Mercado Pago)», secreto del modo productivo en Vercel y prueba real de bajo valor.

## Flujo automatizado y Asistente TechnoUltra (2026-10-07)
Ticket automático al solicitar, pago inmediato de servicios de precio fijo (Mercado Pago Orders), matriz de flujo en la base de datos, asistente con enrutador (datos propios → reglas → FAQ → IA → respaldo), base de conocimiento versionada con plantillas, Centro de conocimiento del SUPERADMIN, métricas de IA sin contenido y tarea de CRM por pago abandonado. Detalle, matriz y auditoría de automatización en `docs/FLUJO-CLIENTE-Y-ASISTENTE.md`. Migraciones 30–33 aplicadas. Sin E2E completo (pendiente a petición).

## Sentry (2026-10-06)
- `SENTRY_DSN` configurado en `.env.local` y en Vercel Production. Reporte por la API de envelopes (sin SDK): `onRequestError` + `reportActionError`, con datos personales depurados.
- Verificado con 2 eventos reales (HTTP 200 de Sentry): error de servidor y error de acción, sin correo/teléfono/token en el mensaje.
- Pendiente (opcional): `SENTRY_AUTH_TOKEN` + `@sentry/nextjs` solo si se quieren source maps; el asistente `@sentry/wizard` es interactivo y no se ejecutó.

## Catálogo Excelenter + tienda pública + Sentry SDK (2026-10-07)
- Migración 34 aplicada: subcategorías, columnas de proveedor en `products`, `product_source` (costo solo administración), historial de precios, registros de sincronización, consultas por WhatsApp, motor `sync_catalog` y bloqueo de productos de proveedor en pedidos. Ver `docs/EXCELENTER-CATALOG.md` y `docs/PRODUCT-SHIPPING.md`.
- Tienda pública `/tienda` (categorías, subcategorías, búsqueda, marca, precio, orden, paginación, ficha con WhatsApp), administración `/b/tienda` (filtros, costo/precio, disponibilidad) y `/b/tienda/sincronizacion` (sincronizar ahora, importar CSV, historial, consultas).
- Cron `/api/cron/catalog-sync`. Fuente automática pendiente: la hoja de Google está privada (401) → compartirla «con el enlace» y definir `EXCELENTER_CATALOG_CSV_URL`.
- Sentry: SDK `@sentry/nextjs` 11 (servidor, edge y navegador) con depuración total de datos personales (`lib/sentry-scrub.ts`), sin Session Replay, CSP con el host exacto del DSN, source maps con `SENTRY_AUTH_TOKEN` en el build.
- `npm run check`: 548 pruebas, build OK.

## Auditoría y E2E completos (2026-10-07)
E2E: 314 comprobaciones OK (escenarios 01–07; nuevo 07 de la tienda). Corregidos: ficha de producto 500 en producción, IA sin ligar al ticket automático, privilegios de `service_role` del catálogo (migración 35). Detalle, pendientes y veredicto en `docs/AUDITORIA-PRE-PRODUCCION.md`.
