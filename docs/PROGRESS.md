# Progreso

## Fase actual: FASE 0 — Base del proyecto (completada) → siguiente: FASE 1 (Supabase) **bloqueada por decisión**

### Hecho

- Repo git inicializado (rama `main`). Prototipo de diseño movido a `design/` sin modificarlo.
- Next.js 16 (App Router) + TypeScript estricto + Tailwind 4 + ESLint + Prettier + Vitest.
- Manrope vía `next/font`; tokens de marca en `globals.css`; safe-areas, `dvh`, `prefers-reduced-motion`, `viewport-fit=cover`.
- Cabeceras de seguridad (HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy). Verificadas con `next start`.
- Validación de entorno con Zod: públicas (`env.public.ts`) vs. solo-servidor (`env.server.ts`, `server-only`).
- `.env.example` sin secretos + test que impide secretos en `NEXT_PUBLIC_*` y valores reales.
- CI de GitHub Actions (typecheck, lint, tests, build).
- Home provisional con identidad de marca (splash del diseño).

### Validaciones

- typecheck OK · lint OK · tests 3/3 · build OK.

### Pendiente / bloqueos

- Supabase: ver DECISIONS D-001. No se ha ejecutado ninguna migración.
- GitHub: `gh` no está instalado; falta repo remoto. Vercel: la cuenta conectada no tiene equipos/proyectos.
- CSP con nonce: se implementa en `proxy.ts` junto con la sesión de Supabase (Fase 2).
