# Pago de cotizaciones: anticipo del 50 % o pago total con 5 % de descuento

Migración `20261011000043_quote_payment_plans.sql` (aditiva). Todo el cálculo vive en la base de datos; la pantalla solo muestra lo que devuelve `quote_payment_summary`.

## Fórmulas (pesos colombianos enteros, redondeo estándar)

| Concepto | Fórmula |
| --- | --- |
| Base (saldo elegible) | `round(quotes.total)` — el total ya viene **neto del crédito por diagnóstico**, que `recompute_quote` aplica una sola vez |
| Anticipo | `round(base × 50 %)`, sin descuento |
| Saldo tras el anticipo | `base − pagado − descuento` |
| Descuento por pago total | `round(base × 5 %)` |
| Pago total | `base − descuento` |

Ejemplo (caso del encargo): conceptos $559.600 − crédito $39.900 = **base $519.700** → anticipo **$259.850** y saldo **$259.850**; o pago total con descuento **$25.985** → **$493.715**.

Reglas:
- El 5 % solo existe en la modalidad «total» y solo si todavía no hay ningún pago confirmado de la cotización. El anticipo y el saldo nunca llevan descuento.
- El crédito por diagnóstico no se vuelve a descontar: ya está dentro de `quotes.total`.
- Cada cobro guarda `installment` (deposit / balance / full), `discount_amount` y `pricing_detail` (versión de la cotización, base, crédito, tasa, descuento, importe): el cálculo es reproducible y auditable (`audit_logs`: `payment.quote_started`, `payment.manual_*`).
- Un cobro en curso de la misma modalidad se reutiliza (doble clic, recargar, volver atrás). Uno distinto bloquea (`payment_in_validation`); si el cliente cambia de modalidad sin terminar el pago en línea, el servidor verifica la Order con Mercado Pago y la **cancela** antes de crear otra.
- Una cotización aprobada no se puede revisar (versión nueva) en el flujo actual; si una versión queda reemplazada antes de aprobarse, no se puede pagar (`quote_not_payable`).

## Estados del servicio

- **Aprobar ya no inicia el servicio** si hay algo por cobrar: el ticket queda en «Esperando aprobación» con la cotización aprobada y el cliente elige cómo pagar.
- El **primer pago confirmado** (anticipo o total, en línea verificado o manual) pasa el ticket a «En servicio» (o «Esperando repuesto») por `apply_transition` del sistema, en la misma transacción que registra el pago.
- El personal tampoco puede iniciarlo a mano sin pago (`precondition_failed: quote_payment_pending`).
- No se puede **entregar** con saldo pendiente (`precondition_failed: balance_pending`).
- Si el crédito cubre toda la cotización, la aprobación inicia el servicio como antes.
- «Pagar saldo restante» se habilita al cliente cuando el ticket está en «En pruebas» o «Listo para entregar».
- Cotizaciones anteriores a esta regla que ya avanzaron sin pago: el saldo se cobra con la modalidad «saldo» (sin descuento).

## Funciones

| Función | Quién | Para qué |
| --- | --- | --- |
| `begin_quote_payment(actor, quote, plan)` | servidor (cliente dueño) | Crea/reutiliza el cobro en línea con su importe |
| `record_manual_quote_payment(actor, quote, plan, method, …)` | servidor (técnico asignado o SUPERADMIN) | Efectivo/datáfono (comprobante obligatorio)/transferencia (pendiente de validación)/otro |
| `quote_payment_summary(quote)` | cliente dueño o personal autorizado (`can_view_quote`) | Resumen para pantallas |
| `begin_service_payment(.., 'quote', ..)` / `record_manual_service_payment_v2(.., 'quote', ..)` | — | Ahora responden `plan_required` (camino viejo cerrado) |

## Pantallas

- Cliente (ticket y visor de cotización): «¡Cotización aprobada!», resumen (valor, crédito, pendiente), opciones *Pagar el 50 % de anticipo* y *Pagar el 100 % y ahorrar un 5 %* con el ahorro exacto; luego «Anticipo confirmado» / «Pago completo confirmado»; validación con la misma verificación en el servidor (`/api/pagos/estado`) que el diagnóstico.
- Técnico/SUPERADMIN (ficha del ticket → Pagos): estado, modalidad, valor, crédito, descuento, pagado, saldo, último pago (método, fecha, referencia) y registro manual por modalidad. La lista de tickets muestra «Aprobada sin pago», «Pago en validación», «Anticipo · saldo $X», «Liquidada» o «Pagada (total −5 %)».

## Pruebas

- `tests/db/quote-payment-plans.test.ts` (11): cálculos del caso del encargo, crédito una sola vez, bloqueo del servicio, webhooks repetidos, importe manipulado, rechazo, modalidades, saldo y entrega, pagos manuales, acceso cruzado.
- E2E `03` (pago total manual con 5 %), `16` (anticipo → servicio → saldo al final, paneles, avisos).
- **No validado con Mercado Pago real**: la aprobación de un pago de cotización en el checkout (requiere el comprador de prueba del propietario). La lógica del proveedor es la misma ya verificada para el diagnóstico (crear → consultar → cancelar Order de prueba).
