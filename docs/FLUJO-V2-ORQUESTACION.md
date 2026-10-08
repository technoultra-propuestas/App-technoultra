# Reingeniería del flujo (v2): menos decisiones, más orquestación

Principio: **la IA propone · el técnico valida · el sistema ejecuta · el cliente recibe información clara.**
La IA no cobra, no aprueba, no firma, no cambia permisos ni estados críticos. Todo lo crítico se decide en el servidor (RLS + funciones de base de datos).

## 1. Estados separados (no se mezclan)

| Dimensión | Fuente de verdad | Lo que ve la persona |
| --- | --- | --- |
| Solicitud | `service_requests` / `tickets` (estado inicial `received`) | «Solicitud recibida» (no significa dinero ni equipo) |
| Pago | `payments` (+ `diagnosis_credits`, `quotes.paid_at`, `tickets.prepaid_at`) | Pendiente · En validación · Confirmado · Rechazado · Vencido · Reembolsado |
| Equipo físico | `receptions` + evidencia de recepción | «Pendiente de recibir tu equipo» / «Equipo recibido» |
| Diagnóstico | `diagnostics` (`finalized_at`) + `documents` (PDF) | «Tu equipo está en diagnóstico» → «Diagnóstico listo» |
| Cotización | `quotes` (+ `quote_events`) | Pendiente de tu respuesta · Aprobada · Rechazada · Vencida |
| Servicio / entrega | `tickets.status` (`in_service`, `testing`, `ready`, `delivered`) | «Estamos trabajando…», «Estamos probando…», «Listo», «Entregado» |

No se creó un enum nuevo: la máquina actual (`ticket_status`) ya representa el avance; el resto son dimensiones independientes derivadas en el servidor
(`src/lib/domain/ticket-flow.ts`, `src/lib/payments/state.ts`, `src/lib/payments/staff.ts`, `src/lib/domain/next-action.ts`).
El cliente nunca ve estados internos (`payment_intent`, `webhook`, `pending_internal_validation`…) ni el nombre del proveedor de pagos.

## 2. Pagos

- La pantalla del técnico consulta SIEMPRE `payments` antes de ofrecer una acción (`PaymentsPanel`):
  - **Confirmado** → método, fecha, referencia y comprobante; sin «Registrar pago».
  - **En validación** (pago en línea o transferencia) → «No se debe registrar manualmente hasta que se confirme». Solo el SUPERADMIN puede confirmar una transferencia o anular el intento (con motivo y auditoría).
  - **Pendiente** → formulario manual.
- Métodos manuales: **efectivo**, **datáfono**, **transferencia**, **otro**. Registra técnico asignado o SUPERADMIN (`record_manual_service_payment_v2`).
  - Efectivo/otro: confirmado al registrar.
  - Datáfono: **comprobante (foto privada en Cloudinary, etapa `payment`) obligatorio**, de ese ticket y no reutilizado.
  - Transferencia: nace «pendiente de validación»; subir una imagen no la confirma; la confirma el SUPERADMIN (`confirm_manual_payment`).
- Sin duplicados: índices únicos de cobro activo por concepto + advisory lock + comprobaciones con errores claros (`diagnosis_already_paid`, `payment_in_validation`…). El camino manual **ya no anula** un pago en línea en validación.
- Auditoría: método, monto, estado, usuario, fecha, referencia, origen, comprobante (`payments.reference/note/voucher_evidence_id`, `audit_logs`).
- Las transferencias pendientes no vencen solas; los pagos en línea abandonados siguen venciendo a las 48 h (con tarea de CRM).
- Cliente: «Pagar» solo aparece si el servidor dice que se puede; «continuar con el pago» solo para pagos en línea.

## 3. Cotización por conceptos

- Cada línea tiene `concept` (mano de obra / repuesto / producto / otro) y `priority` (necesario · recomendado · opcional). La mano de obra es un concepto de primera clase.
- La cotización muestra por separado **Mano de obra y servicios**, **Repuestos**, **Productos**, **Otros**; luego subtotal, descuentos, impuestos, urgencia, domicilio, **«Crédito por diagnóstico (ya lo pagaste)»** y **«Total a pagar»**, con la explicación «El valor del diagnóstico ya pagado se descuenta del total porque apruebas la reparación».
- Propuesta automática (`src/lib/quotes/proposal.ts`, determinista): del texto del cliente, del diagnóstico del técnico y de las causas de la IA salen servicios **reales del catálogo con su precio**. Lo que no existe en el catálogo → «Requiere revisión» (no suma); precios «desde» y «a cotizar» → «Requiere revisión». No inventa servicios, precios, repuestos ni compatibilidad. «Usar propuesta» (`applyProposalAction`) recalcula todo en el servidor; el navegador solo envía los ids elegidos.
- Los productos del Shop (Excelenter) no entran a cotizaciones (la BD los bloquea): se recomiendan con enlace al producto y «Conviene verificar compatibilidad antes de comprar».
- Al **enviar**, el PDF de la cotización se genera solo (versión nueva en cada revisión; las versiones firmadas se conservan). El cliente la abre en `/c/tickets/[id]/cotizacion`: hoja legible con el mismo contenido, botón «Ver cotización en PDF», y barra fija con **Aprobar** (acción principal) · **Tengo una pregunta** · **Rechazar** (motivo corto). Pregunta y respuesta quedan en `quote_events` asociadas a la cotización. El técnico ve «Cotización rechazada por el cliente» con el motivo.
- Nota de diseño: el PDF no se incrusta en un iframe (CSP `frame-ancestors 'none'` y X-Frame-Options DENY siguen intactos; los visores de PDF en móvil no son fiables). El «visor propio» es la hoja HTML con el mismo contenido y huella + enlace al PDF emitido.

## 4. Diagnóstico

- Preliminar (IA, antes de recibir el equipo): siempre rotulado «Diagnóstico preliminar… sujeto a verificación técnica presencial».
- Técnico (real): hallazgos, pruebas, componentes, recomendaciones. **«Finalizar diagnóstico»** (`finalize_diagnosis`) lo emite: visible al cliente, constancia en auditoría y PDF «Informe de diagnóstico» (ticket, cliente, equipo y serial, fecha, síntomas reportados, pruebas, hallazgos, recomendaciones, técnico, aviso). Editarlo después y finalizar de nuevo genera una versión nueva del documento.
- Cliente: «Diagnóstico listo» → **Ver diagnóstico** (PDF/visor); «Productos recomendados · Ver en Shop» solo con evidencia en el texto.

## 5. Panel del técnico: «Próxima acción»

Una sola indicación según hechos verificados (recibir equipo → completar fotos → registrar diagnóstico → finalizar → generar propuesta → revisar y enviar → esperar aprobación / responder pregunta → servicio → pruebas → listo → entrega). Los demás controles siguen disponibles abajo (cambio manual de estado incluido). Recepción: el botón «Actualizar recepción» solo aparece con cambios; con las 4 fotos obligatorias + acta el ticket **pasa solo a «En diagnóstico»** (misma función `transition_ticket`, sin saltar validaciones). Nunca se automatiza «Reparado», «Listo», la aprobación de una cotización ni un pago por una imagen.

## 6. Cliente: «Ahora estamos aquí»

Un bloque con título, explicación y **una acción principal** (Pagar · Ver diagnóstico · Ver cotización · Coordinar entrega) según modalidad (recogida, domicilio, local, remoto sin entrega física).

## 7. Navegación

El Shop vive dentro de la app del cliente: con sesión de cliente `/tienda`, producto, categoría y carrito usan `ClientShell` (riel en escritorio, **BottomNav** en móvil) mediante `ShopShell`; visitantes y personal conservan la cabecera pública. Un solo shell por pantalla.

## 8. Carrito y WhatsApp

El carrito no es checkout. Tras «Comprar por WhatsApp» muestra «Pedido enviado a WhatsApp… todavía no hay ningún cobro». Mensaje de producto: Producto, Referencia, Precio, Cantidad: 1 + «¿Me pueden confirmar disponibilidad y coordinar la entrega?» (sin «precio actual»). Envíos: Cali urbano $10.000 · fuera del perímetro/zonas aledañas $20.000, sujeto a validación de dirección (configurables en el CRM del Shop).

## 9. Migraciones

- `20261007000038_manual_payments_datafono.sql`: etapa de evidencia `payment`, slot `voucher`, columnas de `payments`, funciones `record_manual_service_payment_v2`, `confirm_manual_payment`, `cancel_pending_payment`, `expire_pending_service_payments` (conserva la tarea de CRM), política de lectura de cobros para el técnico del ticket, y retiro de la función manual anterior.
- `20261007000039_quote_concepts_diagnosis_final.sql`: `quote_items.concept/priority/suggested_by_system`, `diagnostics.finalized_at/by`, `finalize_diagnosis`.
- `20261007000040_quote_approval_fingerprint.sql`: al aprobar, el evento y la auditoría guardan código, versión y SHA-256 del PDF de la cotización vigente que el cliente revisó.
