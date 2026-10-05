# Seguridad

Principios: Zero Trust; secretos solo en servidor; autorización en servidor + RLS; auditoría de acciones críticas.

## Implementado (Fase 0)

- Cabeceras HTTP: HSTS, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy.
- `poweredByHeader` desactivado; source maps de navegador desactivados (por defecto).
- Separación de variables públicas/privadas + test automático sobre `.env.example`.

## Pendiente

CSP con nonce (Fase 2), RLS y autorización (Fases 1-2), rate limiting, validación de uploads, auditoría completa (Fase 14).

## Implementado en Fase 1 (base de datos)

- RLS en 100 % de las tablas (`tests/db/security.test.ts` lo verifica) y privilegios mínimos por columna.
- Anti-escalada: rol/estado/correo/tokens/estado de ticket/precios/totales/pagos no modificables desde la API.
- Anti-IDOR: autorización por recurso (`private.can_*`) en cada política; el técnico solo ve lo asignado.
- Funciones SECURITY DEFINER con `search_path` vacío; EXECUTE revocado a PUBLIC/anon/authenticated y concedido explícitamente.
- Tablas de evidencia inmutables (historiales, auditoría, firmas, aceptaciones legales, movimientos de inventario) incluso para el propietario.
- Auditoría con cadena de hashes (detecta manipulación) y verificación en `private.verify_audit_chain()`.
- Cobertura y reglas de negocio en triggers, no en el frontend.

## Riesgos conocidos / pendientes

- `anon` puede ejecutar `track_ticket` y `check_coverage`: el servidor debe aplicar rate limiting por IP.
- La cadena de auditoría serializa las escrituras; revisar si el volumen crece.
- Retención/anonimización de datos personales (Ley 1581): definir procedimiento antes de producción.
