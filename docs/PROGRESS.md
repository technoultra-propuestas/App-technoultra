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
