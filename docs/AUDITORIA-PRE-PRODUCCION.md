# Auditoría pre-producción — 2026-10-07

Alcance: aplicación completa (cliente, personal, tienda pública, pagos, IA, catálogo Excelenter, observabilidad). Método: revisión de código y configuración, pruebas automáticas, E2E real (Chrome + Next de producción + Supabase local) y comprobaciones contra producción **sin crear datos reales**. No se hicieron pruebas de carga ni cobros reales.

## Resultado de las pruebas
| Capa | Resultado |
| --- | --- |
| `npm run check` (tipos, lint, 550 pruebas unitarias/BD, build) | OK · lint sin errores (16 avisos de variables sin usar en tests) |
| Pruebas de base de datos (PGlite, RLS y migraciones reales) | 17 archivos, todas OK |
| E2E completo (314 comprobaciones) | 01 registro 6/6 · 02 MFA y roles 19/19 · 03 flujo completo 41/41 · 04 seguridad 60/60 · 05 panel 133/133 · 06 cotización 6/6 · 07 tienda 49/49 |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| Búsqueda de secretos en archivos versionados | Sin secretos reales (solo tokens ficticios en pruebas) |
| Cabeceras de producción | HSTS, CSP con nonce (connect-src limitado a Supabase, Cloudinary y el host exacto de Sentry), X-Frame DENY, nosniff, Referrer-Policy, Permissions-Policy |
| Rutas sensibles en producción | `/api/cron/*` 401 sin secreto · webhook de pagos 405 en GET · `/b/*` redirige sin sesión · producto inexistente/categoría inexistente 404 |

## Hallazgos corregidos durante la auditoría
1. **Ficha de producto con error 500 en producción** (`optimizedImage` vivía en un archivo cliente y se llamaba desde el servidor). Corregido y verificado en producción (200, WhatsApp, «1 unidad disponible»).
2. **El diagnóstico de IA no llegaba al ticket** en el flujo automático (el técnico no lo veía ni podía validarlo). Corregido en `c/solicitar/actions.ts` con prueba unitaria y E2E.
3. **Consultas por WhatsApp no se guardaban**: `service_role` no tenía privilegios sobre las tablas nuevas (migración 35). Corregido y aplicado.
4. **Pruebas E2E desactualizadas** respecto al ticket automático (escenario 03) y datos erróneos en la prueba de la tienda: actualizados.
5. Sentry: el reportero propio y el SDK ya no duplican eventos (el reportero solo deja registro local en `onRequestError`).

## Pendientes y riesgos (en orden de importancia para salir a producción)
**Bloquean el cobro real**
1. **Mercado Pago producción:** las credenciales cargadas en Vercel son las de **prueba**. Falta: credenciales productivas (token y public key), webhook productivo con el evento «Order (Mercado Pago)» en `https://app.technoultra.com/api/webhooks/mercadopago` y su secreto en `MERCADOPAGO_WEBHOOK_SECRET`, y una compra real de bajo valor (con reembolso) para validar de punta a punta.
2. **Rotar los dos secretos que se imprimieron por error** en una sesión anterior (secreto del webhook de prueba y el secreto OAuth comentado en `.env.local`).
3. **Datos legales y comerciales** que no se inventan: razón social / NIT, textos legales finales, porcentajes de urgencia (hoy 0 %).
4. **MFA del propietario:** inscribir el autenticador del SUPERADMIN (sin MFA el panel del personal no autoriza).

**Funcionalidad dependiente de ti**
5. **Fuente automática del catálogo:** la hoja de Google devuelve 401 (es privada). Compartirla «Cualquier persona con el enlace: lector» (o publicarla en la web) y definir `EXCELENTER_CATALOG_CSV_URL=https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=0` en Vercel. Mientras tanto se puede cargar el CSV desde `/b/tienda/sincronizacion`.
6. **Sentry — source maps:** el build recibe **403** al subir (el `SENTRY_AUTH_TOKEN` no tiene permisos suficientes o el org/proyecto no coincide). Crear un token de organización con permisos de releases/proyecto (`project:releases`, `org:read`, `project:write`) y confirmar los slugs `technoultra` / `javascript-nextjs`. Los errores sí llegan a Sentry; solo faltan las líneas legibles.
7. **Geocodificación de direcciones** (para calcular el domicilio de productos automáticamente): elegir proveedor y credenciales. Hoy el domicilio es informativo y se confirma por WhatsApp. Confirmar además qué zonas cubren los $20.000 (hoy ≤ 30 km del perímetro urbano, supuesto técnico).

**Calidad y operación**
8. Pruebas de carga/estrés y un recorrido manual en iPhone/Android reales (instalación PWA, teclado móvil, cámara).
9. Contraste AA con herramienta automática y revisión de lector de pantalla.
10. Rediseño pendiente (sin impacto funcional): cotización/firma, pagos, documentos, equipos, carrito, perfil y ayuda del cliente; legal, comercial, cobertura, ajustes y proyectos del personal.
11. Imágenes del catálogo: usan las URLs de Cloudinary de Excelenter (dependemos de que sigan publicadas). Copiarlas a la cuenta de TechnoUltra requiere su autorización.
12. Vercel Cron: el plan actual solo garantiza ejecuciones diarias (la sincronización corre una vez al día, 09:00 UTC).
13. Respaldo y recuperación: confirmar copias de seguridad del proyecto Supabase y un ensayo de restauración.

## Veredicto
**Listo para operar en modo de prueba / piloto cerrado** (servicios, tickets, cotizaciones, IA, tienda con WhatsApp y panel). **No listo para cobros reales** hasta resolver los puntos 1–4. Los puntos 5–7 mejoran la operación pero no bloquean.
