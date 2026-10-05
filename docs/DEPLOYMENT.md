# Despliegue

- **App:** Vercel → `app.technoultra.com`. **Sitio público:** `technoultra.com` (no se modifica; `@` y `www` intactos).
- DNS (Hostinger): solo agregar el CNAME de `app` con el valor que entregue Vercel, tras revisar los registros actuales.
- Variables: ver `.env.example`; se cargan en Vercel por entorno (development / preview / production), nunca en el repo.
- CI: `.github/workflows/ci.yml` (typecheck, lint, test, build).
- Estado: repo remoto y proyecto Vercel pendientes (ver PROGRESS.md).
