# Acceso de clientes y personal · MFA

## Dos puertas, un solo sistema de identidad (Supabase Auth)
| | Clientes | Personal (técnico / admin) |
|---|---|---|
| Entrada | `/login`, `/registro`, `/recuperar`, `/verificar` | `/gestion/login`, `/gestion/recuperar` |
| Métodos | correo + contraseña (confirmación por **enlace**) y Google | correo + contraseña **+ TOTP obligatorio** (nunca Google) |
| Zona | `/onboarding`, `/c/*`, públicas | `/b/*` (panel) |
| Alta | registro público (rol `client`) | solo un admin (`/b/usuarios`); no hay registro público |

`/equipo` (ruta anterior) redirige a `/gestion/login`.

## Capas de autorización (ninguna confía en el navegador)
1. **Proxy** (`src/proxy.ts`): sin sesión → su puerta (`loginPathFor`); `/b/*` sin `aal2` → `/gestion/mfa`. El `aal` sale del JWT con firma verificada (`getClaims`).
2. **Layouts y páginas** (`requireRole`): rol leído de `profiles` (nunca de metadatos); personal sin `aal2` → `/gestion/mfa`; cliente en zona de personal → `/c`.
3. **Server Actions / Route Handlers** (`assertRole`): rol + `aal2` para personal (401 si falta MFA, 403 si el rol no corresponde).
4. **Base de datos (RLS)**: `private.my_role()` devuelve el rol de técnico/admin **solo con `aal2`** (migración 24). Con `aal1` el personal no tiene rol: no lee ni escribe datos de gestión aunque existiera un fallo en la app. Su propio perfil sigue visible para poder completar el MFA.
5. **Correo confirmado**: Supabase Auth no emite sesión con correo sin confirmar; las cuentas de personal se crean ya confirmadas por el backend.

## MFA (TOTP de Supabase Auth)
- Inscripción, desafío y verificación son los de Supabase (`mfa.enroll/challenge/verify`). **No** se implementa TOTP propio, **no** se guarda el secreto ni los códigos en nuestras tablas, **no** se usa SMS ni correo.
- Primer ingreso: contraseña → `/gestion/mfa` → QR/clave (solo en esa respuesta) → código de 6 dígitos → `aal2` → panel. Con MFA ya configurado: contraseña → código → panel.
- No se puede inscribir un segundo factor desde una sesión `aal1` si ya hay uno verificado.
- Límites: 8 intentos/10 min por usuario en verificación; login 6/10 min por correo y 20/10 min por IP.
- **Teléfono perdido:** otro admin usa «Restablecer MFA» en `/b/usuarios` (elimina factores en Supabase Auth, auditado). Si el único admin lo pierde: `node --env-file=.env.local scripts/reset-staff-mfa.mjs correo@dominio.com`.

## Contraseñas
- **Cambiar (autenticado):** `/b/seguridad` → contraseña actual (verificada con un cliente sin estado, sin tocar la sesión) + código TOTP vigente + política (≥10, mayúscula, minúscula, número) → `updateUser` en Supabase Auth → se revocan las demás sesiones → auditoría.
- **Recuperar:** `/gestion/recuperar` → enlace de Supabase → `/auth/callback` (cookie `tu_next=/gestion/restablecer`) → sesión `aal1` sin privilegios → si hay MFA, primero el código; solo entonces se fija la contraseña (GoTrue además exige `aal2` para cambiar la contraseña con MFA inscrito) → se revocan otras sesiones → de nuevo MFA. La respuesta es idéntica exista o no la cuenta. Solo sirven sesiones nacidas de un enlace de correo (no de contraseña ni Google).
- **Alta de personal:** el backend crea el usuario (correo confirmado, sin contraseña), la base asigna el rol (`admin_provision_staff`: nadie cambia su propio rol ni deja el sistema sin admin) y se envía por Resend un enlace propio (`/auth/confirm?token_hash=…`) para crear la contraseña; después configura el MFA. No depende de plantillas de Supabase.
- Nunca se guardan contraseñas ni hashes propios, ni se envían por correo, ni se escriben en logs.

## Google y el callback
Google es solo para clientes. `/auth/callback` cierra la sesión de cualquier cuenta de personal salvo recuperación por enlace de correo con la cookie de gestión; `/auth/google` nunca admite destinos `/b` ni `/gestion`. Las cuentas de personal no tienen identidad de Google.

## Auditoría (`audit_logs`, encadenada con SHA-256)
`staff.login`, `staff.mfa_enroll`, `staff.mfa_success`, `staff.mfa_failure`, `staff.logout`, `staff.password_changed`, `staff.password_reset`, `staff.session_revoked` (RPC `log_staff_event`, lista cerrada, metadatos acotados a `method/reason/scope`); `admin.user_created`, `admin.role_changed`, `admin.user_disabled/enabled`, `admin.settings_changed`, `admin.security_changed` (RPC/funciones solo de servidor). Nunca contraseñas, códigos TOTP, secretos ni tokens.

## Roles
Se mantiene `client`, `technician`, `admin` (no existe OWNER/superadmin). Cambios de rol solo en servidor, con actor admin verificado en BD y auditoría. Un solo nivel de admin: si se necesita un propietario con controles adicionales, es una decisión de negocio futura.

## Pruebas
`tests/db/mfa.test.ts` (AAL, escalamiento, auditoría), `tests/unit/staff-auth.test.ts`, `tests/unit/staff-security.test.ts`, `tests/unit/oauth-routes.test.ts`, `tests/unit/auth-email-actions.test.ts` y la prueba E2E real en producción (técnico, administrador, cliente, invitación, recuperación y comprobaciones RLS con JWT reales).
