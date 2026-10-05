# Decisiones

## D-001 — Proyecto Supabase de TechnoUltra (ABIERTA, bloquea Fase 1)

Se pidió verificar `https://agosikmonvjujxzokdlc.supabase.co`. No se pudo: ese ref no aparece ni con el conector de Supabase
(error de permisos) ni con el `SUPABASE_ACCESS_TOKEN` del entorno (solo ve el proyecto "Brivia", ajeno a TechnoUltra).
Es probable que pertenezca a otra cuenta/organización. **No se ha tocado ningún proyecto.** Opciones: (a) autorizar la cuenta correcta,
(b) crear un proyecto nuevo de TechnoUltra, (c) darme otro token con acceso a ese proyecto.

## D-002 — Estructura del repo

El prototipo de Claude Design se movió a `design/` (referencia, excluido de lint/format). La app está en la raíz.

## D-003 — CSP

Una CSP con nonce obliga a render dinámico. Se aplicará en `proxy.ts` para rutas autenticadas (Fase 2) y se valorará una política
estática estricta para páginas públicas/SEO (Fase 14), para no perder rendimiento ni caché.

## D-004 — Íconos

El diseño usa la fuente Material Symbols por CDN. En producción se usarán SVG/íconos autoalojados (PWA offline y privacidad).
