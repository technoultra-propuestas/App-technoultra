# Arquitectura

## Capas
- **Frontend:** Next.js 16 (App Router), TypeScript estricto, Tailwind 4 con los tokens del diseño aprobado (Manrope, #FF8A00, #121212, #F6F6F5…). Server Components por defecto; Client Components solo para formularios, firma, carrito y subida de archivos. Íconos SVG y fuentes autoalojados.
- **Backend:** Supabase (Postgres 17, Auth, Storage). La lógica de negocio crítica vive **en la base de datos** (triggers y funciones `SECURITY DEFINER`), de modo que ninguna ruta de la app puede saltarla.
- **Servidor de la app:** Server Actions y Route Handlers validan sesión, rol, propiedad y entradas (Zod) y usan `service_role` solo para lo que el servidor ya autorizó (límites de intentos, webhooks, evidencias, firmas, documentos).
- **Next 16:** `src/proxy.ts` (antes middleware): sesión (`getClaims`), CSP con nonce, rutas protegidas. Todo el sitio se renderiza dinámicamente por el nonce.

## Mapa de rutas
Públicas: `/`, `/servicios[/slug]`, `/cobertura/[ciudad]`, `/soporte-remoto`, `/legal/[slug]`, `/seguimiento`, `/login`, `/registro`, `/verificar`, `/recuperar`, `/restablecer`, `/equipo`.
Cliente (`/c/*`): inicio, solicitar, tickets, tienda, carrito, pedidos, equipos, direcciones, documentos (+firma), proyectos, perfil, legal pendiente, más. Transversales: `/onboarding`, `/avisos`, `/documentos/[id]` (descarga).
Personal (`/b/*`): panel, tickets (recepción, diagnóstico, checklist, cotización, entrega, documentos), agenda, CRM; solo administración: solicitudes, servicios, productos, pedidos, cobertura, proyectos, reportes, legal, ajustes, usuarios.
API: `/api/webhooks/mercadopago`, `/api/cron/housekeeping`. Auth: `/auth/google`, `/auth/callback`, `/auth/confirm`.

## Base de datos (`supabase/migrations/`, 18 archivos)
01 fundaciones/auditoría · 02 identidad · 03 catálogo+cobertura · 04 tickets · 05 comercio/pagos · 06 documentos/legal/CRM · 07 flujo (estados) · 08 RLS · 09 grants+auditoría · 10 auth/onboarding · 11 cotizaciones · 12 checklist/IA · 13 storage/documentos · 14 tienda/pagos · 15 tareas periódicas · 16 legal admin · 17 cola de correos · 18 reportes.

Flujos clave: ticket (`ticket_transitions` + `private.apply_transition` con precondiciones), cotización (`send_quote`/`decide_quote`/`revise_quote`…), pedido (`create_order` calcula todo; stock en libro mayor), pago (`begin_payment`/`apply_payment_event`, solo servidor), documentos (hash + firma que valida el hash), legal (versiones inmutables + aceptación).

## Integraciones (todas detrás de adaptadores server-only)
Supabase · Google OAuth (vía Supabase) · Cloudinary (subida firmada, activos privados, verificación en servidor) · Gemini (JSON validado) · Mercado Pago (firma HMAC + consulta a la API) · Resend (correo, opcional) · Vercel (despliegue + cron).

## Decisiones
Ver `DECISIONS.md`.
