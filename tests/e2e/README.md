# Pruebas E2E de TechnoUltra

Recorren la aplicación real (Chrome + servidor Next + Supabase Auth/Postgres) igual que lo haría una persona.
**Nunca corren contra producción**: tickets, pagos, historial y auditoría son inmutables por diseño, así que no se podrían limpiar.
Por eso usan la pila **local** de Supabase y se niegan a ejecutarse si `NEXT_PUBLIC_SUPABASE_URL` no es `127.0.0.1`/`localhost`.

## Requisitos

- Docker Desktop encendido y Google Chrome instalado (o `CHROME_PATH`).
- `npx supabase start` (la pila local usa los puertos 563xx, definidos en `supabase/config.toml`, para no chocar con otros proyectos).
- `.env.local` con las claves reales de **Cloudinary** y **Gemini** (las subidas de fotos y la IA se prueban de verdad).
  Mercado Pago y Resend se dejan fuera a propósito: el pago se prueba por la vía manual y el correo sale por Mailpit.

## Uso

```bash
npm run e2e:setup        # genera .env.e2e (ignorado por git) desde `supabase status` y .env.local
npm run e2e              # corre todos los escenarios sobre la base local existente
npm run e2e:reset        # reinicia la base local (migraciones + catálogo) y corre todo desde cero
node tests/e2e/run.mjs 03          # solo los escenarios cuyo nombre contenga "03"
node tests/e2e/run.mjs --dev         # usa `next dev` (más rápido de iterar, pero con arranques en frío que pueden dar falsos fallos)
node tests/e2e/run.mjs --keep-assets # no borra de Cloudinary las fotos de prueba al terminar
```

El estado de la corrida (usuarios de prueba, secretos TOTP, avance de la cadena) vive en `tests/e2e/.state.json`
(ignorado por git). La cadena completa es reanudable por fases; con `--reset` se descarta.

## Escenarios

| Archivo | Qué prueba |
| --- | --- |
| `01-cliente-registro` | Registro, correo de verificación por enlace (Mailpit), onboarding de 6 pasos, el cliente no entra al CRM. |
| `02-personal-mfa-roles` | `/gestion/login` con MFA TOTP (enrolamiento real), límites técnico vs SUPERADMIN, guardado y validación de ajustes del negocio. |
| `03-flujo-completo` | CLIENTE → SOLICITUD (con IA real) → TICKET → RECEPCIÓN → FOTOS (Cloudinary real) → DIAGNÓSTICO → COTIZACIÓN → APROBACIÓN → PAGO (en línea sin credenciales y manual) → SERVICIO → PRUEBAS → ENTREGA → GARANTÍA → MANTENIMIENTO. |
| `04-seguridad-escalada` | Sesiones reales: escalada de privilegios, aislamiento entre clientes, funciones sensibles, MFA exigida por la base de datos, inmutabilidad. |

## Estructura

- `run.mjs`: orquestador (reset opcional, siembra personal y textos legales de prueba, arranca la app y Chrome, limpia Cloudinary).
- `setup-env.mjs`: genera `.env.e2e`.
- `lib/browser.mjs`: controlador mínimo de Chrome por DevTools Protocol (perfil propio en la carpeta temporal; no toca tu Chrome).
- `lib/support.mjs`: TOTP (RFC 6238), lector de correo (Mailpit), reporte de resultados.
- `lib/actors.mjs`: registro de cliente, onboarding, login de cliente y de personal con MFA.
- `lib/fixtures.mjs`: siembra (solo base local), SQL de verificación (`docker exec` al contenedor de la base).
- `lib/cloudinary.mjs`: borra los activos de prueba (solo prefijos de pruebas).

## Notas

- Los límites de correo/inicios de sesión de `supabase/config.toml` están subidos **solo para la pila local**; producción usa SMTP propio.
- Las plantillas de correo locales (`supabase/templates/`) son por enlace, igual que las de producción.
- Si cambias `supabase/config.toml` o las plantillas: `npx supabase stop && npx supabase start`.
