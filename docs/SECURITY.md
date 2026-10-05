# Seguridad (Zero Trust)

Principio: **el navegador nunca decide**. Ocultar botones es solo UX; cada operación se autoriza en servidor y otra vez en RLS/BD.

## Identidad y roles
- Rol únicamente en `profiles.role`, leído de la BD. Todo registro (correo o Google) nace `client`; el rol en metadatos del usuario se ignora (probado).
- Personal: sin registro público. `admin_provision_staff` y `bootstrap_first_admin` solo `service_role`, tras verificar al actor.
- Columnas privilegiadas (rol, activo, correo, estado de ticket, totales, pagos, token público…) protegidas por GRANT por columna **y** triggers invoker (`private.is_privileged_session`).
- Sesión: cookies httpOnly de `@supabase/ssr`; `getUser()` en servidor; el proxy usa `getClaims()`; **nada de auth en localStorage**.

## Datos
- RLS en el 100 % de las tablas; ningún `USING (true)` (prueba automática). `anon` solo lee catálogo, cobertura, legal publicado y ajustes públicos.
- Anti-IDOR: `private.can_view_*` / `can_manage_*` en cada política; técnico solo ve lo asignado; URLs ajenas → 404.
- Tablas de evidencia inmutables incluso para el propietario: historiales, auditoría (cadena SHA-256 verificable), firmas, aceptaciones legales, eventos de pago, movimientos de inventario, eventos de cotización.
- Dinero: precios de catálogo obligatorios (sobreescribir exige `pricing.override`), totales por trigger, pedidos calculados por `create_order` sin aceptar precios del cliente, pagos aprobados solo vía `apply_payment_event` (firma + consulta a Mercado Pago + monto/moneda + idempotencia).
- Cobertura física validada por trigger en BD.

## Aplicación
- CSP con nonce por petición, sin `unsafe-eval` en producción; HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy.
- Open redirect: `safeNext` (probado con payloads codificados). OAuth: PKCE, errores sin reflejar texto externo.
- Límite de intentos en BD (falla cerrado) en login, registro, OTP, recuperación, subidas, IA, pagos, firma.
- Subidas: firma de un solo uso, activos privados, verificación en Cloudinary (carpeta del ticket, formato, tamaño) antes de registrar. Firmas: PNG real (magic bytes), tamaño acotado, evidencia inmutable.
- IA: clave solo servidor, entrada como datos JSON (anti prompt-injection), salida con esquema cerrado e ids del catálogo, aviso preliminar añadido por el servidor, validación humana registrada.
- Descarga de documentos por streaming desde el servidor (sin URLs públicas), autorizada por RLS.
- Correos: HTML escapado, solo enlaces https/localhost, cola con reclamo atómico.
- Secretos solo en servidor (`env.server.ts`); prueba que impide secretos en `NEXT_PUBLIC_*`. `npm audit` sin vulnerabilidades.

## Pruebas de seguridad
`tests/db/security.test.ts` (RLS, anti-escalada, IDOR, cobertura, estados, dinero, firma, auditoría, superficie de funciones), `tests/db/quotes.test.ts`, `tests/db/store.test.ts`, `tests/db/auth.test.ts`, `tests/unit/*`.

## Riesgos / pendientes
- Verificar todo contra Supabase real tras `db push` (las pruebas usan PGlite).
- `track_ticket`, `check_coverage`, `product_stock_flags` son públicas por diseño; la app limita intentos por IP.
- La cadena de auditoría serializa escrituras (aceptable al volumen previsto).
- Firma electrónica simple: no equivale automáticamente a firma digital certificada (Ley 527/1999). Revisión jurídica pendiente.
- Procedimiento de retención/supresión de datos personales (Ley 1581/2012) por definir.
- Rotar cualquier credencial que haya estado en un entorno compartido; `SUPABASE_ACCESS_TOKEN` del sistema apunta a otra cuenta.
