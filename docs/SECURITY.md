# Seguridad

Principios: Zero Trust; secretos solo en servidor; autorización en servidor + RLS; auditoría de acciones críticas.

## Implementado (Fase 0)

- Cabeceras HTTP: HSTS, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy.
- `poweredByHeader` desactivado; source maps de navegador desactivados (por defecto).
- Separación de variables públicas/privadas + test automático sobre `.env.example`.

## Pendiente

CSP con nonce (Fase 2), RLS y autorización (Fases 1-2), rate limiting, validación de uploads, auditoría completa (Fase 14).
