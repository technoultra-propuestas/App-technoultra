# Mercado Pago · Checkout Pro + Orders API

TechnoUltra cobra con **Checkout Pro mediante Orders API** (`POST /v1/orders`). La API de *Preferences* y el webhook de tipo `payment` (heredados) ya **no se usan**.

## Flujo
```
Cliente → Server Action (sesión + rol cliente + límite de intentos)
  → Supabase: calcula el importe REAL, crea/reutiliza el payment pendiente (begin_payment / begin_service_payment)
  → Mercado Pago: POST /v1/orders  (X-Idempotency-Key = ord-<payment.id>, external_reference = referencia interna del pago)
  → se guarda el id de la Order en payments.external_id y se redirige a checkout_url
  → el cliente paga en Checkout Pro y vuelve a ?pago=exito|pendiente|fallo (SOLO informativo)
  → Mercado Pago → POST /api/webhooks/mercadopago (evento «Order (Mercado Pago)», firmado)
  → verifica x-signature → consulta GET /v1/orders/{id} → verifica aplicación, moneda, monto y referencia
  → apply_payment_event (idempotente) → payments / payment_events / auditoría / notificación
```
El navegador **no puede** marcar un pago como aprobado: no existe ninguna ruta de cliente que cambie `payments.status`; solo el webhook (o la conciliación) con verificación en servidor.

## Archivos
| Pieza | Archivo |
| --- | --- |
| Cliente de la API (crear/consultar/cancelar Order, firma, estados) | `src/lib/payments/mercadopago.ts` |
| Aplicar una Order al modelo interno | `src/lib/payments/orders.ts` |
| Webhook | `src/app/api/webhooks/mercadopago/route.ts` (POST, público sin sesión, protegido por firma) |
| Conciliación + cancelación de Orders vencidas | `src/lib/payments/reconcile.ts` (cron `/api/cron/housekeeping`) |
| Pago de diagnóstico/cotización | `src/app/c/tickets/pay-actions.ts` |
| Pago de pedidos de tienda | `src/app/c/pedidos/actions.ts` |
| Idempotencia, monto/moneda/referencia, estados finales | funciones SQL `apply_payment_event`, `guard_payment`, tabla `payment_events` (único por `provider, provider_event_id`) |

## Reglas verificadas contra la API real (Colombia)
- `type: "online"`, `processing_mode: "manual"`, `total_amount` como **texto entero** ("30100"; COP no lleva decimales).
- Los ítems solo admiten `title`, `unit_price`, `quantity`…; **no** `total_amount` ni `unit_measure` (la API responde 400).
- `total_amount` debe ser exactamente Σ(`unit_price` × `quantity`): el servidor lo comprueba antes de llamar y no envía nada si no cuadra.
- Respuesta: `id` (`ORD…`), `checkout_url`, `integration_data.application_id`, `currency: COP`. Se descarta cualquier respuesta cuya referencia, total, moneda o dominio no coincida con lo pedido.
- `expiration_time` en ISO 8601 (`P2D` = 48 h, igual que el vencimiento interno). Al vencer el pago interno, la conciliación cancela también la Order.
- La notificación firma `id:<data.id en minúsculas>;request-id:<x-request-id>;ts:<ts>;` con HMAC-SHA256; el id real de la Order es en mayúsculas (se normaliza).

## Mapeo de estados (Order → interno)
| Mercado Pago | Interno |
| --- | --- |
| `processed` + `accredited` | `approved` (exige que lo cobrado = total esperado) |
| `processed` + `partially_refunded` | `approved` (sin cambio) |
| `processed` + `refunded` · `refunded` | `refunded` |
| `failed` | `rejected` |
| `canceled` | `cancelled` |
| `expired` | `expired` |
| `created`, `processing`, `action_required`, desconocidos | `pending` (nunca aprobado) |

Los estados finales son monótonos (`guard_payment`): un webhook retrasado no reabre un pago aprobado.

## Variables (solo servidor)
`MERCADOPAGO_ACCESS_TOKEN` · `MERCADOPAGO_WEBHOOK_SECRET`. `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` no la usa el código (Checkout Pro no la necesita). Nunca `NEXT_PUBLIC_` para secretos. No se usan `CLIENT_ID`/`CLIENT_SECRET` (sin OAuth).

## Configuración en Mercado Pago (Tus integraciones → TechnoUltra → Webhooks)
- URL: `https://app.technoultra.com/api/webhooks/mercadopago`
- Evento: **solo «Order (Mercado Pago)»**.
- Hay una configuración y una **clave secreta distinta por modo** (prueba y productivo): la de Vercel Production debe ser la del **Modo productivo**.
- Respuesta esperada del endpoint: 200 en menos de 22 s (401 firma inválida · 200 duplicado/ignorado · 502 si la API no responde → Mercado Pago reintenta).

## Pruebas
- `tests/unit/mercadopago.test.ts` (firma, estados, importes, creación de Order, errores 400/401/409/429/500/red, consulta, cancelación).
- `tests/unit/mercadopago-webhook.test.ts` (firma inválida/ausente, tipos ignorados, Order inexistente/de otra aplicación/otra moneda, monto distinto, 2/5/10 repetidos, simultáneos, sin PII en el evento).
- `tests/unit/service-payments.test.ts` (importe de servidor, referencia, clave de idempotencia, conciliación).
- `tests/db/service-payments.test.ts`, `tests/db/store.test.ts` (estados, idempotencia y liquidación en la base).
- `npm run check:integrations` valida credenciales con llamadas de solo lectura (sin imprimir secretos).

## Pendiente / decisiones
- Reembolsos y cancelaciones manuales desde el CRM: **no implementados** a propósito (sin botones peligrosos). Hoy solo se cancela la Order al vencer el pago interno; los reembolsos se hacen en el panel de Mercado Pago y llegan por webhook como `refunded`.
- Prueba de pago real de bajo valor: pendiente de confirmación explícita.
