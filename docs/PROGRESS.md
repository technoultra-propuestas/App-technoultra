# Progreso

## Estado: FASE 1 (BD) completa en local · FASE 2 (Auth + onboarding) implementada en código · remoto PENDIENTE de credenciales

### Fase 1 — Supabase + seguridad (hecho y probado en PGlite)

10 migraciones (`supabase/migrations/`), 55+ tablas con RLS, anti-escalada, cobertura, máquina de estados, auditoría con cadena de hashes, pagos/firma/legal inmutables. Ver `DECISIONS.md` (D-010…D-019).

### Fase 2 — Auth + identidad + onboarding (hecho en código; sin probar contra Supabase real)

- Registro con código por correo, login, logout, recuperación y cambio de contraseña, Google OAuth (PKCE), `/equipo` (solo login de personal).
- `proxy.ts` con sesión, CSP con nonce y rutas protegidas; `requireRole`/`assertRole`; límite de intentos en BD.
- Onboarding persistente en 6 pasos (bienvenida, celular, dirección con cobertura, equipo, avisos, legal) y aceptación legal versionada.
- Administración de personal en `/b/usuarios` (invitar/promover/activar/desactivar); bootstrap del primer admin.
- Páginas públicas: bienvenida, `/legal/[slug]`, `/seguimiento` (token no adivinable).
- Adaptador Resend (opcional, no falla sin credencial) y plantillas escapadas.
- Pruebas: 88 (unitarias + BD): safeNext, CSP, validaciones, OTP, rate-limit, bootstrap, onboarding, plantillas de correo.

### Validaciones

typecheck OK · lint OK · tests 88/88 · build OK · smoke de `next start`: rutas protegidas redirigen a `/login?next=…`, CSP con nonce presente.

## BLOQUEOS (requieren acción tuya, nada de esto se puede inventar)

1. **`.env.local` está VACÍO en disco (0 bytes).** Posiblemente no se guardó en el editor. Necesita:
   `SUPABASE_DB_PASSWORD` (para `supabase db push`), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`.
2. La CLI devuelve 401 al usar el token de login (login-role y api-keys): no puedo aplicar migraciones ni leer claves por esa vía.
3. Google OAuth: crear el cliente OAuth en Google Cloud y pegarlo en Supabase → Auth → Providers.
4. Correo de verificación: configurar SMTP (Resend) en Supabase → Auth → SMTP y aplicar plantillas (`supabase config push` o pegarlas en el panel).
5. Textos legales: publicar versiones reales (revisión de abogado). Sin ellos el onboarding no tiene qué aceptar.

## Siguiente (cuando se desbloquee)

`supabase db push` → verificar remoto → tipos TS → prueba E2E de registro/login → Fase 3 (servicios, cobertura, equipos, solicitudes).
