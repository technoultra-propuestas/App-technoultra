# Arquitectura

- **Frontend:** Next.js 16 App Router. Server Components por defecto; Client Components solo para interacción.
- **Backend:** Supabase (Postgres + Auth + RLS). Mutaciones por Server Actions / RPC; webhooks y IA por Route Handlers.
- **Seguridad en capas:** UI → servidor (sesión, rol, propiedad, estado, Zod) → RLS → constraints de BD.
- **Next 16:** el antiguo `middleware` se llama `proxy.ts`. Referencia de la versión en `node_modules/next/dist/docs/`.
- **Diseño:** `design/` es referencia; los tokens viven en `src/app/globals.css`.
- **Entorno:** `src/lib/env.public.ts` (navegador) y `src/lib/env.server.ts` (servidor, `server-only`).
- Modelo de datos y plan completo: [AUDITORIA-Y-PLAN.md](AUDITORIA-Y-PLAN.md).
