# Despliegue

## Entornos
- Producción: `https://app.technoultra.com` (Vercel). Sitio público `technoultra.com` en Hostinger **no se modifica** (`@` y `www` intactos). Solo agregar el CNAME de `app` con el valor que entregue Vercel, tras revisar los registros actuales.
- Supabase: proyecto `agosikmonvjujxzokdlc` ("App-technoultra"). Nunca otros proyectos.

## Pasos (en orden)
1. **Variables locales** (`.env.local`, ignorado por git): `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`.
2. **Migraciones:** `set -a; . ./.env.local; set +a; env -u SUPABASE_ACCESS_TOKEN npx supabase db push --dry-run` y luego `db push`. Verificar tablas/RLS/funciones; `npx supabase gen types typescript --linked > src/lib/database.types.ts`.
3. **Auth en el panel de Supabase:** Site URL `https://app.technoultra.com`; Redirect URLs `…/auth/callback` (producción y `http://localhost:3000`); *Confirm email* activo; plantillas de correo con `{{ .Token }}` (`supabase/templates/`); SMTP personalizado con Resend. Google: `docs/GOOGLE_OAUTH.md`.
4. **Primer administrador:** registrarse en la app, verificar el correo y ejecutar `node --env-file=.env.local scripts/bootstrap-admin.mjs correo@dominio.com`.
5. **Vercel:** importar el repo `technoultra-propuestas/App-technoultra`; cargar variables por entorno (ver abajo); dominio `app.technoultra.com`; el cron `/api/cron/housekeeping` (vercel.json, diario) usa `CRON_SECRET`.
6. **Mercado Pago:** credenciales de prueba en `development/preview`, de producción en `production`; registrar el webhook `https://app.technoultra.com/api/webhooks/mercadopago` y copiar el secreto en `MERCADOPAGO_WEBHOOK_SECRET`.
7. **Legal:** cargar y publicar textos en `/b/legal` (revisados por abogado).
8. **Catálogo:** servicios, productos, inventario y ajustes del negocio desde el panel (nada de precios en código).

## Variables de entorno (ver `.env.example`)
Públicas: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
Solo servidor: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CRON_SECRET`.

## Verificación de cada despliegue
CI: typecheck, lint, tests, build (`.github/workflows/ci.yml`). Después de desplegar: probar login, Google, solicitud con cobertura, cotización→aprobación, pago de prueba, firma y descarga de PDF.

## Cloudflare
No necesario para el MVP (Vercel + Supabase cubren CDN/TLS). Evaluar WAF/Turnstile solo si hay abuso.

## Mercado Pago: variables requeridas (pendientes de credenciales)
| Variable | Dónde se usa | Entorno | Server-only |
|---|---|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | `src/lib/payments/mercadopago.ts` (crear preferencia y consultar el pago), `src/app/c/pedidos/actions.ts`, `src/app/api/webhooks/mercadopago/route.ts` | Production (credenciales de producción) y Preview/Development (credenciales de prueba) | Sí |
| `MERCADOPAGO_WEBHOOK_SECRET` | Verificación de la firma HMAC del webhook (`x-signature`) en `/api/webhooks/mercadopago` | Mismo entorno que el token | Sí |

- `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` aparece en `.env.example` pero **el código no la usa** (Checkout Pro redirige al enlace de pago); no hace falta cargarla.
- Webhook a registrar en el panel de Mercado Pago: `https://app.technoultra.com/api/webhooks/mercadopago` (eventos de pagos). El secreto que entrega Mercado Pago es `MERCADOPAGO_WEBHOOK_SECRET`.
- Sin estas variables la tienda funciona hasta crear el pedido; pagar muestra un aviso amable y el webhook responde sin procesar. Un pago solo pasa a `approved` tras verificar con Mercado Pago (nunca por lo que diga el navegador).
- Los pagos de diagnóstico y de cotizaciones hoy se registran manualmente (administración); cobrarlos con Mercado Pago requiere extender `begin_payment` (hoy solo pedidos).
