# Notificaciones por responsabilidad (v2)

Principio: **se avisa a quien debe saber o actuar, no a todo el sistema.** Cada aviso se crea en la base de datos, dentro de la misma transacción del cambio de negocio **confirmado** (nunca desde el navegador), con una **clave de evento** única por destinatario (`notifications_event_uidx`): un webhook repetido, un doble clic o un reintento no duplican avisos.

Cadena de vida (cada etapa es independiente y se registra):

`evento confirmado → aviso creado (in-app) → envío intentado → envío confirmado/fallido (notification_deliveries) → leído (read_at)`

- El aviso **dentro de la app siempre existe** (es la fuente de verdad); correo y push son canales adicionales.
- Un fallo de correo o push **no se oculta**: queda en `notification_deliveries` (`status`, `attempts`, `last_error`) y en el log del servidor.
- Nadie recibe el aviso de **su propia acción** (excepto la confirmación que el cliente necesita ver).
- Los textos al cliente **no prometen plazos** y la palabra «Recibido» ya no se usa para el estado genérico del ticket.

## Matriz evento → destinatarios → canales

Canales: **App** = centro de avisos (siempre). **Correo** = según preferencia del usuario; el cliente recibe los hitos de la lista; el personal solo los de prioridad *alta*. **Push** = solo si el usuario activó avisos en un dispositivo; prioridad *alta* o *normal*.

| Evento (origen en BD) | Cliente | Técnico asignado | SUPERADMIN | Prioridad |
| --- | --- | --- | --- | --- |
| Solicitud creada (`on_ticket_created`) | «Recibimos tu solicitud» (solo confirma el registro + qué sigue según modalidad) | — | «Nueva solicitud» para asignar | alta (admin) |
| Ticket asignado / reasignado (`on_ticket_assigned`) | — | «Nuevo ticket asignado» | — (es quien asigna) | alta |
| Pago en línea aprobado (`settle_payment`) | «¡Recibimos tu pago!» + qué sigue según modalidad | «Pago confirmado» (diagnóstico/servicio) | — (ya verificado por el proveedor) | alta |
| Pago manual confirmado | igual que arriba | igual | «Pago manual registrado» (conciliación) | normal |
| Transferencia registrada sin confirmar | — | — | «Transferencia por validar» | alta |
| Pago en línea rechazado / vencido | «No se pudo completar tu pago» / «Tu pago venció» | — | «Incidencia de pago» (1 por concepto y día) | alta |
| Pago cancelado por el cliente | «Tu pago se canceló» | — | — | alta |
| Pedido de tienda pagado | «Recibimos tu pago» | — | «Nuevo pedido pagado» | alta |
| Acta de recepción generada (`on_document_created`) | «Firma el acta de recepción» (enlace directo al documento) | — (ve el acta pendiente en el ticket) | copia de supervisión | alta |
| Acta firmada (`on_document_signed`, migración 45) | «Documento firmado» (confirmación) | «Firmada: acta de recepción»: ya puede diagnosticar | **aviso propio** «Firmada: acta de recepción» (prioridad alta, con push; reemplaza la copia de supervisión) | normal/alta |
| Excepción autorizada (sin firma del acta) | — | «Excepción autorizada» | «Excepción autorizada» + motivo (auditada) | alta |
| Documento disponible (`notify_document_available`: diagnóstico, cotización, entrega, garantías) | «Nuevo documento: …» | — | copia de supervisión | normal |
| Equipo recibido (acta de recepción) | «Recibimos tu equipo» | «Equipo recibido» (si no lo registró él) | — | normal |
| Inicio de diagnóstico | «Tu equipo está en diagnóstico» | Tarea «Diagnóstico por completar» | — | normal |
| Diagnóstico finalizado | «Tu diagnóstico está listo» | — | — | alta |
| Cotización publicada (`send_quote`) | «Tienes una cotización» | — | — | alta |
| Cliente pregunta en la cotización | — | «Pregunta del cliente» (la responde) | «Pregunta del cliente» (seguimiento; si no hay técnico, la atiende) | alta/normal |
| Cotización aprobada | «¡Cotización aprobada!» + elegir cómo pagar (anticipo 50 % o total −5 %) | «Cotización aprobada»: esperar el pago antes de intervenir | «Cotización aprobada» (cobro/seguimiento) | alta |
| Anticipo de la cotización confirmado | «¡Pago confirmado!» (anticipo; el saldo se paga antes de la entrega) | «Anticipo confirmado»: puede iniciar | «Pago de cotización» | alta/normal |
| Pago total confirmado (5 %) | «Pago completo confirmado» | «Pago completo» | «Pago de cotización» | alta/normal |
| Saldo restante confirmado | «Saldo pagado» | «Saldo liquidado» | «Pago de cotización» | alta/normal |
| Cotización rechazada | «Registramos tu decisión» | «Cotización rechazada» | «Cotización rechazada» (cierre) | alta/normal |
| Espera de repuesto | «Estamos esperando un repuesto» | — | «Ticket en espera de repuesto» | normal/alta |
| Servicio habilitado (en servicio; **no** significa que el técnico ya empezó: no existe un evento «reparación iniciada» y no se inventa) | «Tu servicio quedó habilitado» (no afirma que el técnico ya empezó) | — | — | normal |
| Equipo listo | «Tu equipo está listo» (con saldo: «paga el saldo restante de $X») | — | — | alta |
| Entrega confirmada | «Entrega confirmada» (documentos y garantía disponibles) | — | — | normal |
| Ticket cancelado | «Tu servicio fue cancelado» | «Ticket cancelado» | «Ticket cancelado» | normal |
| Ticket sin asignar > 4 h (cron diario) | — | — | «Ticket sin asignar» | alta |
| Equipo listo sin entregar > 3 días (cron diario) | — | — | «Equipo listo sin entregar» | normal |
| Pago en línea sin confirmar > 30 min (cron diario) | — | — | «Pago en línea sin confirmar» (1 por pago y día) | alta |

Estados sin aviso propio a propósito: `received` (la solicitud ya se avisó), `awaiting_approval` (lo avisa la cotización) y `testing` (interno).

## Privacidad del push

La notificación del sistema lleva **título + cuerpo genérico («Abre TechnoUltra para ver los detalles.») + ruta interna**. Nunca montos, direcciones, nombres ni detalles del servicio. Al tocarla se abre la ruta interna (con la sesión del usuario; si no la tiene, pide iniciar sesión).

## Aislamiento (Zero Trust)

- `notifications`: RLS de lectura/actualización solo del dueño (`recipient_id = auth.uid()`), y el cliente solo puede cambiar `read_at`.
- `notification_deliveries`: **sin acceso** para `anon`/`authenticated` (solo `service_role`).
- `claim_push_notifications`, `claim_email_notifications`, `record_delivery`, `notify_stale_tickets`: solo `service_role`.
- Funciones internas (`private.notify*`, `private.on_*`): no ejecutables desde la API.
- `/api/push/subscribe`: sesión verificada en el servidor (`getUser()`), mismo origen (`Origin`), el dueño del dispositivo sale **siempre de la sesión** (nunca del cuerpo), endpoint `https` validado.

## El SUPERADMIN no queda «ciego» (copia de supervisión)

`private.notify` deja, para cada aviso a un cliente o técnico **de un ticket/documento/pago**, una copia de tipo `supervision` para el SUPERADMIN (prioridad *baja*: **sin correo ni push**, para no inundarlo). El texto lleva el contexto: «Para cliente · Servicio TU-… · <nombre del cliente>. …». Reglas: si el SUPERADMIN ya tiene su aviso propio del mismo evento no se duplica; si llega después, lo reemplaza (conserva «leído»). En Avisos aparece con la etiqueta **Supervisión** y el filtro «Supervisión» (solo SUPERADMIN). El técnico y el cliente nunca ven estas copias (RLS por destinatario). Cobertura: `tests/db/reception-signature.test.ts` y E2E 18.

## Sonido y push: qué se puede y qué no

- **Push real (Web Push, VAPID):** el servidor envía título, cuerpo genérico y ruta interna (sin montos, direcciones ni datos del servicio: nada sensible en la pantalla de bloqueo). Estados registrados por envío: creado → intentado → aceptado/fallido (`notification_deliveries`); suscripciones caducadas (404/410) se eliminan; el `tag` = id del aviso evita duplicados visibles.
- **Sonido de marca:** la API de notificaciones web **no permite elegir el sonido** de una notificación del sistema. Con la app cerrada o en segundo plano suena el tono que el dispositivo tenga para notificaciones, y **no se intenta saltar** el modo silencio ni No molestar. Lo que sí existe: un **timbre suave dentro de la app abierta** (Web Audio, sin archivos) que el usuario activa en Avisos → «Sonido con la app abierta» (apagado por defecto; el service worker avisa a la ventana visible con solo el `tag`; no suena dos veces por el mismo aviso). iOS solo entrega push con la app instalada en la pantalla de inicio.
- **Pendiente de validar con personas y dispositivos reales:** llegada del push en Android/iOS/escritorio, sonido del sistema y timbre in-app. Las pruebas automatizadas **no** lo demuestran.

## Preferencias

- `notification_preferences.email_enabled` (por defecto activo) y `push_enabled` (por defecto apagado; se enciende al activar un dispositivo).
- Los avisos dentro de la app no se pueden apagar.
- El permiso del navegador **solo se pide al pulsar «Activar avisos en este dispositivo»** (nunca al cargar). Si está bloqueado o no hay soporte, se explica y la app sigue igual.

## Operación

- Claves VAPID: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (solo servidor). Sin ellas el push queda desactivado sin afectar nada más.
- Los envíos se programan tras cada acción relevante (`after()`) y se barren en el cron diario (`housekeeping`): correo (`flushEmailOutbox`) y push (`flushPushOutbox`). Plan Hobby de Vercel: sin cola en tiempo real; los avisos *in-app* son inmediatos, correo/push salen al final de la acción que los originó o, en el peor caso, en el siguiente barrido del cron.
- Un envío push reclamado se reintenta hasta 3 veces (ventana de 2 min) y solo mientras el aviso tenga menos de 6 h.
- Suscripciones caducadas (404/410 del servicio push) se eliminan solas.

## Pruebas

- `tests/db/notifications.test.ts` (18): destinatarios por evento, idempotencia, aislamiento entre clientes y técnicos, reclamo push/correo, permisos de las funciones internas.
- `tests/unit/push.test.ts` (9) y `tests/unit/payment-states.test.ts` (9): envío push (con y sin push, sin datos sensibles, limpieza de caducadas, fallo visible), ruta de suscripción (401/403/400, dueño por sesión), estados de pago A–E.
- E2E `14-pago-estados-avisos` (20): estados de pago en el navegador (móvil), centro de avisos por rol, abrir/leer, preferencias.
- **No probado de extremo a extremo**: la entrega real de una notificación push a un dispositivo físico (requiere un navegador con permiso y un servicio push real) y el envío real de correos con Resend en producción. Ver `PROGRESS.md`.

## Envío inmediato y dispositivos (2026-10-13)
Todas las acciones que generan avisos (firma del cliente, acta, firma presencial, excepción, pagos, cotización, diagnóstico, solicitud) llaman a `scheduleEmailFlush()`; como respaldo, los layouts con sesión programan el envío como mucho una vez cada 20 s por instancia (`scheduleFlushThrottled`). Detalle de causas, limitaciones de Android/iOS y qué sigue sin probarse en dispositivos reales: [`PWA-INSTALACION-Y-AVISOS.md`](PWA-INSTALACION-Y-AVISOS.md).
