# Copias de seguridad (Supabase en plan gratuito)

El plan gratuito de Supabase **no incluye copias automáticas ni recuperación a un punto en el tiempo**. TechnoUltra las hace por su cuenta:

| Qué | Cómo | Cuándo | Dónde queda |
| --- | --- | --- | --- |
| Base de datos (`public`, `private`, `auth`, `storage`, `supabase_migrations`) | `pg_dump` 17, formato personalizado | Cada noche, 03:00 (Colombia) | Artefacto **cifrado** de GitHub Actions, 30 días |
| Archivos de Storage (bucket `documents`: PDF de cotizaciones, diagnósticos, actas…) | Descarga por la API con la clave de servicio + manifiesto con SHA-256 | Igual | Mismo paquete |
| Fotos de evidencias | Viven en **Cloudinary** (no entran en esta copia) | — | Cloudinary |
| Código y migraciones | Git (GitHub) | Cada cambio | GitHub |

Flujo: `.github/workflows/backup.yml` → `scripts/backup/dump-db.sh` + `scripts/backup/storage-backup.mjs` → `tar` → `gpg --symmetric --cipher-algo AES256`. Sin la frase de cifrado el paquete no se puede abrir.

## Qué NO incluye (a propósito)
Bitácora técnica de Auth, sesiones, refresh tokens y retos MFA en curso: se regeneran solos (los usuarios deberán iniciar sesión de nuevo tras una restauración). Los usuarios, sus identidades y sus factores MFA **sí** se copian.

## Puesta en marcha (una sola vez)
En GitHub: repositorio → **Settings → Secrets and variables → Actions → New repository secret**. Crea estos cuatro:

| Secreto | Valor |
| --- | --- |
| `SUPABASE_DB_URL` | `postgresql://postgres.<ref>:<CONTRASEÑA_URL_CODIFICADA>@aws-0-us-west-2.pooler.supabase.com:5432/postgres` (conexión «Session pooler», puerto 5432; la contraseña con caracteres especiales va codificada) |
| `NEXT_PUBLIC_SUPABASE_URL` | La URL del proyecto, `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | La clave `service_role` (solo en el servidor; nunca en el navegador) |
| `BACKUP_PASSPHRASE` | Una frase larga y aleatoria. **Guárdala además en tu gestor de contraseñas**: si se pierde, las copias no se pueden abrir |

Luego: pestaña **Actions → Copia de seguridad → Run workflow** para la primera copia y comprueba que termine en verde. Cada noche corre sola; si falla, GitHub avisa por correo.

## Probar una restauración (hazlo al menos una vez al mes)
1. Descarga el artefacto `copia-technoultra-AAAA-MM-DD.tar.gz.gpg` (Actions → ejecución → Artifacts).
2. Con Docker encendido: `bash scripts/backup/restore-check.sh technoultra-AAAA-MM-DD.tar.gz.gpg` (pide la frase). Crea un PostgreSQL desechable, restaura y muestra conteos (tablas, clientes, tickets, productos, documentos, usuarios, migraciones). No toca Supabase.
3. Si los números son razonables, la copia sirve.

Última prueba hecha (2026-10-09, contra la base real): 72 tablas, 9 clientes, 3 tickets, 228 productos, 3 documentos, 9 usuarios y 40 migraciones restaurados sin errores relevantes; paquete cifrado y descifrado; una frase incorrecta no descifra.

## Restaurar de verdad (emergencia)
1. Crea un proyecto Supabase nuevo (o reanuda el pausado).
2. Descifra y descomprime la copia: `gpg -d copia.tar.gz.gpg | tar xz`.
3. Restaura la base: `pg_restore --no-owner --no-privileges --dbname "<URL del proyecto nuevo>" db.dump`. Los roles (`anon`, `authenticated`, `service_role`…) y las extensiones ya vienen en un proyecto Supabase nuevo; el aviso «schema public already exists» es normal.
4. Sube de nuevo los archivos de `storage/documents/…` al bucket `documents` (conservando las rutas del manifiesto).
5. Actualiza en Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, y vuelve a desplegar.
6. Verifica: inicio de sesión, un ticket, un documento PDF y el Shop.

## Límites y riesgos conocidos
- Pérdida máxima: hasta 24 horas de datos (la copia es diaria). Si se necesita menos, hay que pasar al plan de pago con recuperación a un punto en el tiempo.
- Las copias viven en GitHub (30 días). Si quieres una segunda copia fuera de GitHub, descarga una cada semana a un disco o a tu nube personal; el archivo ya está cifrado.
- Las fotos de Cloudinary no están incluidas en esta copia.
- Los proyectos gratuitos de Supabase se **pausan tras 7 días sin actividad**: con tráfico real no ocurre, pero conviene saberlo.
