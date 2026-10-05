# Acceso, roles y MFA

## Jerarquía definitiva (decisión de negocio)
```
SUPERADMIN  →  TECHNICIAN  →  CLIENT
```
- **SUPERADMIN = el propietario único de TechnoUltra.** Es el máximo (y único) nivel de privilegio. **No existe ADMIN, ni OWNER, ni ROOT.**
- **TECHNICIAN** es personal operativo (sus tickets, diagnósticos, recepción, evidencias, checklist, cotizaciones, entregas).
- **CLIENT** usa solo el portal de clientes y sus propios datos.
- En la base de datos el enum `app_role` es exactamente `client | technician | superadmin`. El antiguo `admin` se **renombró** (migración 25) conservando UUID, historial, relaciones y auditoría.
- **Un solo SUPERADMIN, garantizado por la BD:** índice único parcial `profiles_single_superadmin`. La aplicación no puede crear, modificar, degradar ni desactivar al SUPERADMIN: `admin_provision_staff` solo asigna `technician` y rechaza al propietario (`cannot_modify_superadmin`). Asignarlo solo es posible con `bootstrap_first_superadmin` (service_role, una única vez) o con acceso directo a la BD.

### Qué puede cada rol
| | SUPERADMIN (con MFA) | TECHNICIAN (con MFA) | CLIENT |
|---|---|---|---|
| Portal | `/gestion/*`, `/b/*` | `/gestion/*`, `/b/*` (menú operativo) | `/login`, `/c/*`, `/onboarding` |
| Clientes, tickets, cotizaciones, documentos, pedidos, pagos | todo | solo lo asignado / lo necesario | solo lo propio |
| Catálogo (servicios, categorías, precios), comercial (IVA, urgencia, domicilio), cobertura, ajustes, legal, privacidad | gestiona | no | no |
| Personal (alta/desactivación de técnicos, restablecer MFA), auditoría, seguridad | gestiona | no | no |
| Cambiar roles / crear SUPERADMIN | **no** (el rol propietario es fijo) | no | no |

## Dos puertas, un solo sistema de identidad (Supabase Auth)
| | Clientes | Personal (técnico / superadmin) |
|---|---|---|
| Entrada | `/login`, `/registro`, `/recuperar`, `/verificar` | `/gestion/login`, `/gestion/recuperar` |
| Métodos | correo + contraseña (confirmación por **enlace**) y Google | correo + contraseña **+ TOTP obligatorio** (nunca Google) |
| Alta | registro público (rol `client`) | solo el SUPERADMIN, y solo técnicos (`/b/usuarios`); no hay registro público |

`/equipo` (ruta anterior) redirige a `/gestion/login`.

## Capas de autorización (ninguna confía en el navegador)
1. **Proxy** (`src/proxy.ts`): sin sesión → su puerta (`loginPathFor`); `/b/*` sin `aal2` → `/gestion/mfa`. El `aal` sale del JWT con firma verificada (`getClaims`).
2. **Páginas** (`requireRole`): el rol se lee de `profiles` (nunca de metadatos del usuario, cookies, query ni localStorage); personal sin `aal2` → `/gestion/mfa`; cliente en zona de personal → `/c`.
3. **Server Actions / Route Handlers** (`assertRole`): rol + `aal2` para el personal (401 sin MFA, 403 si el rol no corresponde). Las acciones de propietario usan `assertRole(["superadmin"])`; las operativas, `["technician","superadmin"]`; las de cliente, `["client"]` + propiedad del recurso.
4. **Base de datos (RLS)**: `private.my_role()` devuelve el rol del personal **solo con `aal2`** (migración 24). Con `aal1` no hay rol y nada de gestión es legible ni escribible. Las políticas administrativas usan `private.is_superadmin()`; el técnico queda limitado por `can_view_*/can_manage_*` y `has_permission`.
5. **Menú**: se genera por rol, pero ocultar un botón nunca es la seguridad: cada ruta y acción se valida igual en el servidor.

## MFA (TOTP de Supabase Auth)
- Inscripción, desafío y verificación son los de Supabase (`mfa.enroll/challenge/verify`). **No** hay TOTP propio, **no** se guardan secretos ni códigos en nuestras tablas, **no** se usa SMS ni correo.
- Primer ingreso: contraseña → `/gestion/mfa` → QR/clave (solo en esa respuesta) → código de 6 dígitos → `aal2` → panel. Con MFA ya configurado: contraseña → código → panel.
- No se puede inscribir un segundo factor desde una sesión `aal1` si ya hay uno verificado.
- Límites: 8 intentos/10 min por usuario en verificación; login 6/10 min por correo y 20/10 min por IP.
- **Teléfono perdido (técnico):** el SUPERADMIN usa «Restablecer MFA» en `/b/usuarios` (auditado). **Teléfono perdido (SUPERADMIN):** `node --env-file=.env.local scripts/reset-staff-mfa.mjs correo@dominio.com`.

## Contraseñas
- **Cambiar (autenticado):** `/b/seguridad` → contraseña actual (verificada con un cliente sin estado) + código TOTP vigente + política (≥10, mayúscula, minúscula, número) → `updateUser` en Supabase Auth → se revocan las demás sesiones → auditoría.
- **Recuperar:** `/gestion/recuperar` → enlace de Supabase → `/auth/callback` (cookie `tu_next=/gestion/restablecer`) → sesión `aal1` sin privilegios → si hay MFA, primero el código; solo entonces se fija la contraseña (GoTrue además exige `aal2` para cambiarla con MFA inscrito) → se revocan otras sesiones → MFA otra vez. Respuesta idéntica exista o no la cuenta. Solo sirven sesiones nacidas de un enlace de correo (no de contraseña ni Google).
- **Alta de un técnico:** el backend crea el usuario (correo confirmado, sin contraseña), la BD fija el rol `technician` y se envía por Resend un enlace propio (`/auth/confirm?token_hash=…`) para crear la contraseña; después configura su MFA.
- Nunca se guardan contraseñas ni hashes propios, ni se envían por correo, ni se escriben en logs.

## Google y el callback
Google es solo para clientes. `/auth/callback` cierra la sesión de cualquier cuenta de personal salvo recuperación por enlace de correo con la cookie de gestión; `/auth/google` nunca admite destinos `/b` ni `/gestion`. Las cuentas de personal no tienen identidad de Google.

## Auditoría (`audit_logs`, encadenada con SHA-256)
- Accesos: el SUPERADMIN registra `superadmin.login | mfa_enroll | mfa_success | mfa_failure | logout | password_changed | password_reset | session_revoked`; el técnico, los mismos como `staff.*` (RPC `log_staff_event`, lista cerrada, metadatos limitados a `method/reason/scope`).
- Administración (solo servidor, `log_admin_event` y las funciones de personal): `superadmin.user_created | user_disabled | user_enabled | role_changed | settings_changed | security_changed | session_revoked`. Los cambios de rol incluyen actor, usuario afectado, `old_role`, `new_role` y fecha.
- Historial: los eventos anteriores `admin.*` / `actor_role='admin'` se conservan intactos (la auditoría es inmutable).
- Nunca se guardan contraseñas, códigos TOTP, secretos, access/refresh tokens ni API secrets.

## Pruebas
`tests/db/superadmin.test.ts` (jerarquía, propietario único, RLS por rol, ataques de escalamiento), `tests/db/mfa.test.ts` (AAL, auditoría), `tests/unit/superadmin-actions.test.ts` (role en formulario/metadatos, alta solo de técnicos, MFA reset), `tests/unit/staff-auth.test.ts`, `tests/unit/staff-security.test.ts`, `tests/unit/oauth-routes.test.ts` y la prueba E2E real en producción.
