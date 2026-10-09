# Copias de seguridad (Supabase en plan gratuito)

El plan gratuito de Supabase **no incluye copias automáticas ni recuperación a un punto en el tiempo**. TechnoUltra las hace por su cuenta.

> **Este repositorio de la aplicación es PÚBLICO. Las copias y sus secretos NO viven aquí.** En un repositorio público los artefactos de GitHub Actions y los registros los puede descargar/ver cualquiera. Por eso el flujo vive en un repositorio **PRIVADO aparte** (`technoultra-backups`) y una prueba automática (`tests/unit/backup-config.test.ts`) impide que se agregue aquí un flujo con secretos de producción. Los scripts (`scripts/backup/`) sí están aquí porque no contienen secretos.

| Qué | Cómo | Cuándo | Dónde queda |
| --- | --- | --- | --- |
| Base de datos (`public`, `private`, `auth`, `storage`, `supabase_migrations`) | `pg_dump` 17, formato personalizado | Cada noche, 03:00 (Colombia) | Artefacto **cifrado** (AES-256) en el repositorio privado, 30 días |
| Archivos de Storage (bucket `documents`: PDF de cotizaciones, diagnósticos, actas…) | Descarga por la API con la clave de servicio + manifiesto con SHA-256 | Igual | Mismo paquete |
| Fotos de evidencias | Viven en **Cloudinary** (no entran en esta copia) | — | Cloudinary |
| Código y migraciones | Git (GitHub) | Cada cambio | GitHub |

Flujo (en el repositorio privado): primer paso = **abortar si el repositorio es público** → `dump-db.sh` + `storage-backup.mjs` → `tar` → `gpg --symmetric --cipher-algo AES256`. Sin la frase de cifrado el paquete no se puede abrir.

## Qué NO incluye (a propósito)
Bitácora técnica de Auth, sesiones, refresh tokens y retos MFA en curso: se regeneran solos (los usuarios deberán iniciar sesión de nuevo tras una restauración). Los usuarios, sus identidades y sus factores MFA **sí** se copian.

## Puesta en marcha (una sola vez)
1. En GitHub crea un repositorio **PRIVADO y vacío** llamado `technoultra-backups` (sin README ni .gitignore) en tu cuenta o en la organización.
2. El contenido listo está en la carpeta local `Proyectos/technoultra-backups` (ya con su commit). Se sube con `git remote add origin <URL> && git push -u origin main`.
3. En ese repositorio privado: **Settings → Secrets and variables → Actions → New repository secret**:

| Secreto | Valor |
| --- | --- |
| `SUPABASE_DB_URL` | `postgresql://postgres.<ref>:<CONTRASEÑA_URL_CODIFICADA>@aws-0-us-west-2.pooler.supabase.com:5432/postgres` (conexión «Session pooler», puerto 5432; la contraseña con caracteres especiales va codificada) |
| `NEXT_PUBLIC_SUPABASE_URL` | La URL del proyecto, `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | La clave `service_role` (solo en este repositorio privado y en Vercel; nunca en el navegador ni en el repositorio público) |
| `BACKUP_PASSPHRASE` | Una frase larga y aleatoria. **Guárdala además en tu gestor de contraseñas**: si se pierde, las copias no se pueden abrir |

4. **Actions → Copia de seguridad → Run workflow**: la primera copia debe terminar en verde. Cada noche corre sola; si falla, GitHub avisa por correo.

### Precauciones con los secretos
- Activa la verificación en dos pasos en tu cuenta de GitHub y no agregues colaboradores al repositorio privado.
- No agregues otros flujos ni acciones de terceros en él.
- Si sospechas una filtración, cambia la clave de servicio y la contraseña de la base en Supabase, actualízalas en Vercel y en este repositorio, y cambia `BACKUP_PASSPHRASE`.

## Probar una restauración (hazlo al menos una vez al mes)
1. Descarga el artefacto `copia-technoultra-AAAA-MM-DD.tar.gz.gpg` (repositorio privado → Actions → ejecución → Artifacts).
2. Con Docker encendido: `bash scripts/backup/restore-check.sh technoultra-AAAA-MM-DD.tar.gz.gpg` (pide la frase). Crea un PostgreSQL desechable, restaura y muestra conteos (tablas, clientes, tickets, productos, documentos, usuarios, migraciones). No toca Supabase.
3. Si los números son razonables, la copia sirve.

Última prueba hecha (2026-10-09, contra la base real): 72 tablas, 9 clientes, 3 tickets, 228 productos, 3 documentos, 9 usuarios y 40 migraciones restaurados sin errores; paquete cifrado y descifrado; una frase incorrecta no descifra.

## Restaurar de verdad (emergencia)
1. Crea un proyecto Supabase nuevo (o reanuda el pausado).
2. Descifra y descomprime la copia: `gpg -d copia.tar.gz.gpg | tar xz`.
3. Restaura la base: `pg_restore --no-owner --no-privileges --dbname "<URL del proyecto nuevo>" db.dump`. Los roles (`anon`, `authenticated`, `service_role`…) y las extensiones ya vienen en un proyecto Supabase nuevo; el aviso «schema public already exists» es normal.
4. Sube de nuevo los archivos de `storage/documents/…` al bucket `documents` (conservando las rutas del manifiesto).
5. Actualiza en Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, y vuelve a desplegar.
6. Verifica: inicio de sesión, un ticket, un documento PDF y el Shop.

## Límites y riesgos conocidos
- Pérdida máxima: hasta 24 horas de datos (la copia es diaria). Si se necesita menos, hay que pasar al plan de pago con recuperación a un punto en el tiempo.
- Las copias viven en GitHub (30 días). Para una segunda copia fuera de GitHub, descarga una cada semana a un disco o a tu nube personal; el archivo ya está cifrado.
- Las fotos de Cloudinary no están incluidas en esta copia.
- Los proyectos gratuitos de Supabase se **pausan tras 7 días sin actividad**: con tráfico real no ocurre, pero conviene saberlo.
