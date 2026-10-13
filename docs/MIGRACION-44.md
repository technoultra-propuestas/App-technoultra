# Migración 44 — acta firmada, excepciones y avisos de supervisión

Archivo: `supabase/migrations/20261012000044_reception_signature.sql`. Reversión de emergencia: `supabase/rollbacks/20261012000044_rollback.sql` (no es una migración; el CLI no la ejecuta).

## Qué cambia
| Objeto | Cambio | Riesgo para datos existentes |
| --- | --- | --- |
| `document_signatures` | + `capture_channel` (por defecto `client_session`, con CHECK), + `captured_by`, `signer_profile_id` pasa a admitir nulo **solo** si el canal es `assisted` | Ninguno: las firmas existentes (0 en producción) conservan sus valores; las restricciones nuevas se cumplen por el valor por defecto |
| `ticket_exceptions` (tabla nueva) | Excepciones autorizadas por el SUPERADMIN; inmutable (`forbid_mutation`), RLS solo lectura para personal que ve el ticket, escritura solo `service_role` | Ninguno (tabla nueva) |
| `private.apply_transition` | Sustituida por la versión anterior **+ un único bloque**: pasar de «Recibido» a «Diagnóstico» exige acta firmada o excepción | Cambia el flujo (ver abajo); el resto de transiciones es idéntico |
| `private.notify` | Misma firma; añade la copia de supervisión para el SUPERADMIN | Los avisos nuevos generan una copia `supervision` (prioridad baja: sin correo ni push) |
| Triggers en `documents` | `documents_notify_created` / `documents_notify_signed` (avisos y avance automático al firmar) | Solo actúan sobre documentos nuevos o recién firmados; no tocan los existentes |
| Funciones nuevas | `reception_signed`, `on_document_created`, `on_document_signed` (sin acceso de `anon`/`authenticated`), `notify_document_available` y `authorize_reception_exception` (solo `service_role`) | — |

No elimina ni modifica filas existentes. Bloqueos: `ALTER TABLE` breves sobre `document_signatures` (tabla vacía en producción) y `CREATE TRIGGER` sobre `documents` (7 filas): milisegundos.

## Efecto sobre el flujo en producción (medido el 2026-10-12)
- Tickets: 3 «Recibido» (1 con recepción registrada y 2 sin ella), 1 «Diagnóstico», 2 «En servicio». Solo el **«Recibido» con recepción** queda a la espera: necesita que el cliente firme el acta (desde su sesión o en el dispositivo del técnico) o que el SUPERADMIN autorice una excepción. Los demás no se ven afectados.
- Ese ticket ya tiene un acta generada antes de la 44, por lo que **no recibió** el aviso «Firma el acta de recepción» (el aviso nace al generar un acta nueva). El técnico la verá como «Pendiente de firma» en la ficha y puede hacerla firmar en el momento, o regenerar el acta (nueva versión → aviso al cliente).
- Tickets que ya pasaron de «Recibido» no se revalidan.

## Orden de despliegue
1. Aplicar la migración (segundos).
2. Desplegar el código inmediatamente después.
Con el código nuevo y sin migración fallarían las consultas a `ticket_exceptions` y las RPC nuevas (el avance automático y los avisos del acta quedarían sin efecto). Con la migración y el código anterior, el avance automático tras la recepción devolvería «falta la firma» y el ticket esperaría; no hay pérdida de datos en ninguno de los dos casos.

## Verificación hecha antes de aplicar (2026-10-12)
- Identidad del proyecto: `agosikmonvjujxzokdlc` (host del pooler con su ref, `NEXT_PUBLIC_SUPABASE_URL`, 43 migraciones, `business.name` = TechnoUltra, 161 servicios, 1 SUPERADMIN).
- **Ensayo en producción con `ROLLBACK`:** la migración completa se ejecutó dentro de una transacción y se revirtió; dentro de ella: RLS activa en `ticket_exceptions` con su única política de lectura; `authorize_reception_exception` y `notify_document_available` solo ejecutables por `service_role`; funciones internas sin acceso de `authenticated`; 0 tablas de `public` sin RLS; mismas políticas en `documents`/`document_signatures`/`tickets`; filas intactas (6 tickets, 7 documentos, 0 firmas, 45 avisos, 11 clientes). Tras el rollback, producción siguió en 43 migraciones y sin objetos nuevos.
- **Ensayo sobre una copia restaurada del respaldo:** aplicar → revertir con el script de reversión → las definiciones de `apply_transition` y `notify` quedan idénticas (MD5) a las de producción y los datos intactos.

## Copia de seguridad previa
`C:\Users\karni\technoultra-backups-local\pre-mig44-20261012-1638.tar.gz.gpg` (AES-256, 650 KB; suma SHA-256 en el `.sha256` contiguo). Contiene `db.dump` (esquemas `public`, `private`, `auth`, `storage`, `supabase_migrations`) y los 7 archivos del bucket `documents` con su manifiesto. La frase está en `C:\Users\karni\.technoultra-secrets\pre-mig44-20261012-1638.passphrase.txt`: **muévela a un gestor de contraseñas**; sin ella no se abre. Restauración probada: 73 tablas, 11 clientes, 6 tickets, 7 documentos, 11 usuarios y 43 migraciones restaurados; una frase incorrecta no descifra. Las fotos de evidencias viven en Cloudinary (no entran en la copia).

## Recuperación
1. **Fallo al aplicar:** la migración corre en una sola transacción (`db push`): si falla, no queda nada a medias.
2. **Problema después de aplicar (sin pérdida de datos):** ejecutar `supabase/rollbacks/20261012000044_rollback.sql` (restaura las dos funciones a su definición exacta previa y retira lo agregado; borra las excepciones y el canal de captura registrados desde entonces) y después `delete from supabase_migrations.schema_migrations where version = '20261012000044'`. Probado sobre una copia restaurada.
3. **Daño de datos:** restaurar desde la copia (`docs/BACKUPS.md` → «Restaurar de verdad»).

## Migración 45 (aplicada a producción el 2026-10-13)
`20261013000045_signature_push_audit.sql`: aviso real (con push) al SUPERADMIN al firmarse el acta y auditoría detallada de la firma (`document.signed`: canal, versión, huella). Aplicada con el procedimiento aprobado (identidad verificada, respaldo `pre-mig45-20261012-2339`, ensayo con ROLLBACK, `db push`). Verificación posterior: 45 migraciones registradas; instantánea de datos, políticas RLS, privilegios de tablas y EXECUTE idéntica salvo la función nueva (sin acceso para `anon`/`authenticated`). Reversión: `supabase/rollbacks/20261013000045_rollback.sql`.
