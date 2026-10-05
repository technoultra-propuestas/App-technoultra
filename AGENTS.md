<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TechnoUltra — reglas del proyecto

- La UI aprobada vive en `design/` (export de Claude Design). Es la referencia visual: Manrope, #FF8A00, #FF9F2A, #000, #121212, #F6F6F5, #5C5C59, #FFF. No rediseñar; migrar fielmente.
- Zero trust: ninguna autorización depende del navegador. Server Actions/Route Handlers validan sesión (`getUser()`), rol, propiedad y estado; RLS es la segunda barrera.
- Secretos solo en servidor (`src/lib/env.server.ts`, `import "server-only"`). Nada sensible en `NEXT_PUBLIC_*` ni en localStorage.
- Precios, totales y pagos se calculan/confirman en servidor. Un pago solo es `approved` tras verificar con Mercado Pago.
- Servicios físicos requieren cobertura validada en servidor; el soporte remoto es nacional.
- Sin mocks de producción. Datos de ejemplo solo en seed de desarrollo.
- Supabase: NO ejecutar migraciones sin verificar que el proyecto es el de TechnoUltra (ver docs/DECISIONS.md).
- Antes de dar por terminado un cambio: `npm run check` (typecheck + lint + tests + build). Actualizar `docs/PROGRESS.md`.
