# Google OAuth (Supabase Auth)

Estado: **código completo y probado con pruebas automáticas; falta la configuración externa** (Google Cloud + panel de Supabase),
que solo puede hacer el propietario de las cuentas. Nada de esto contiene secretos en el repositorio.

## Dos URLs distintas (no confundir)

| Tramo | URL |
|---|---|
| Google → Supabase | `https://agosikmonvjujxzokdlc.supabase.co/auth/v1/callback` |
| Supabase → aplicación (producción) | `https://app.technoultra.com/auth/callback` |
| Supabase → aplicación (desarrollo) | `http://localhost:3000/auth/callback` |

## Cómo funciona en el código

1. El botón **«Continuar con Google»** enlaza a `/auth/google` (`src/app/auth/google/route.ts`).
2. Esa ruta llama a `supabase.auth.signInWithOAuth({ provider: "google" })` en el **servidor** con `@supabase/ssr` (PKCE: el verificador queda en una cookie httpOnly). `redirectTo` = `NEXT_PUBLIC_APP_URL + /auth/callback?next=<ruta interna>`.
3. Google → Supabase (`/auth/v1/callback`) → `/auth/callback` (`src/app/auth/callback/route.ts`), que:
   - maneja `error=` (cancelación `access_denied` → aviso específico; otros → aviso genérico, sin reflejar texto externo);
   - canjea el `code` con `exchangeCodeForSession()` (código inválido/vencido/reutilizado → `/login?error=oauth`);
   - comprueba que exista un **perfil activo** (si no, cierra la sesión);
   - redirige solo a rutas internas (`safeNext`: sin open redirect).
4. La sesión vive en cookies seguras de `@supabase/ssr`; `src/proxy.ts` la refresca y protege rutas; los layouts (`requireRole`) y las acciones (`assertRole`) vuelven a validar rol/propiedad; RLS es la última barrera. **No se usa localStorage para sesión, rol ni permisos.**
5. El perfil lo crea el trigger `private.handle_new_user` con rol **`client` fijo**: ningún metadato de Google, parámetro de URL o dato del navegador puede crear un técnico o administrador. Técnico/administrador solo se asignan con `admin_provision_staff` / `bootstrap_first_admin` (solo `service_role`).

## Configuración manual — Google Cloud Console

1. APIs y servicios → **Pantalla de consentimiento de OAuth**: tipo *Externo*, nombre «TechnoUltra», correo de soporte (puede ser `technoultra.ia@gmail.com`; **eso NO es un Client ID**), dominios autorizados `technoultra.com` y `supabase.co`, alcances `openid`, `email`, `profile`. Publicar la app (o agregar usuarios de prueba mientras esté en *Testing*).
2. Credenciales → **Crear credenciales → ID de cliente de OAuth → Aplicación web**.
   - **Orígenes de JavaScript autorizados:** `http://localhost:3000` y `https://app.technoultra.com`
   - **URI de redireccionamiento autorizados:** `https://agosikmonvjujxzokdlc.supabase.co/auth/v1/callback`
3. Copia el **Client ID** (termina en `.apps.googleusercontent.com`) y el **Client Secret**. No los pegues en el chat ni en el repositorio.

## Configuración manual — Supabase (panel del proyecto `agosikmonvjujxzokdlc`)

1. **Authentication → Sign In / Providers → Google**: activar, pegar Client ID y Client Secret. Dejar *Skip nonce check* desactivado.
2. **Authentication → URL Configuration**:
   - **Site URL:** `https://app.technoultra.com`
   - **Redirect URLs:** `https://app.technoultra.com/auth/callback` y `http://localhost:3000/auth/callback`
3. **Authentication → Providers → Email**: mantener *Confirm email* activo (evita el *pre-hijacking* de cuentas al vincular identidades por correo).
4. No se tocó ningún otro proveedor OAuth.

Alternativa por CLI (sin pegar secretos en el panel): exportar `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` en tu terminal y ejecutar `npx supabase config push` (el bloque `[auth.external.google]` de `supabase/config.toml` los lee del entorno). Revisa el diff que muestra la CLI antes de confirmar: también empuja Site URL, redirecciones y plantillas de correo.

## Variables de entorno de la app

`NEXT_PUBLIC_APP_URL` (`http://localhost:3000` en desarrollo, `https://app.technoultra.com` en producción), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y, para el limitador de intentos, `SUPABASE_SERVICE_ROLE_KEY` (solo servidor). Google no necesita ninguna variable en la app.

## Cómo probar

**Local:** `npm run dev` → abrir `http://localhost:3000/login` → «Continuar con Google» → elegir cuenta → debe volver a `http://localhost:3000/` y redirigir a `/onboarding` (primera vez) o `/c`. Verificar en Supabase → Table editor → `profiles` que `role = client`.
**Producción:** igual en `https://app.technoultra.com/login`, con el dominio en Vercel y las variables de entorno de producción.
**Errores que debe manejar (ya cubiertos por pruebas):** cancelar en Google, código vencido/reutilizado, `next` externo manipulado, usuario sin perfil o desactivado, proveedor mal configurado.

## Pruebas automáticas

`tests/unit/oauth-routes.test.ts` (inicio y callback: PKCE, errores, open redirect, perfil ausente/inactivo, límite de intentos) y `tests/db/auth.test.ts` (alta de Google siempre `client`, metadatos que piden `admin`/`technician` ignorados, un cliente no ejecuta funciones administrativas). **No se probó contra Google/Supabase reales** porque aún no hay credenciales cargadas.
