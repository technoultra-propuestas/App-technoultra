import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { scheduleEmailFlush } from "@/lib/email/outbox";
import { checkWebhookSignature, fetchOrder, ORDER_ID } from "@/lib/payments/mercadopago";
import { applyOrder } from "@/lib/payments/orders";

const reply = (status: number, body: Record<string, unknown> = {}) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const MAX_BODY = 16 * 1024;

/**
 * Webhook de Mercado Pago (evento «Order (Mercado Pago)» de Checkout Pro + Orders API). Orden de seguridad:
 *  1) validar la firma x-signature (HMAC-SHA256 con el secreto del webhook, tiempo constante, ventana de tiempo);
 *  2) NO confiar en el cuerpo: consultar la Order a la API con el token del servidor;
 *  3) aplicar el evento en base de datos de forma idempotente (aplicación, moneda, monto y referencia verificados; estados monotónicos).
 * Respuestas: 401 firma inválida · 200 procesado/duplicado/ignorado · 502 si la API no responde (Mercado Pago reintenta).
 */
export async function POST(request: NextRequest) {
  let env: { MERCADOPAGO_ACCESS_TOKEN: string; MERCADOPAGO_WEBHOOK_SECRET: string };
  try {
    env = serverEnv.mercadopago();
  } catch {
    return reply(503, { error: "not_configured" });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return reply(413, { error: "too_large" });
  let body: { type?: string; action?: string; data?: { id?: string | number } } | null = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  const url = request.nextUrl;
  const dataId = url.searchParams.get("data.id") ?? (body?.data?.id !== undefined ? String(body.data.id) : null);
  const type = url.searchParams.get("type") ?? body?.type ?? null;

  const sig = checkWebhookSignature({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
    secret: env.MERCADOPAGO_WEBHOOK_SECRET,
  });
  if (!sig.ok) {
    // Motivo exacto para diagnosticar (nunca se registra la firma ni el secreto).
    console.warn(JSON.stringify({ event: "mp_webhook_rejected", reason: sig.reason, ts_age_s: sig.tsAgeSeconds, has_request_id: Boolean(request.headers.get("x-request-id")), id_source: url.searchParams.get("data.id") ? "query" : body?.data?.id !== undefined ? "body" : "none", live_mode: (body as { live_mode?: boolean } | null)?.live_mode ?? null }));
    return reply(401, { error: "invalid_signature" });
  }
  // Solo se procesan Orders. Otros tipos (p. ej. `payment` heredado) se reconocen con 200 y no cambian nada.
  // El id firmado puede venir en minúsculas (así lo exige el manifiesto); el id real de la Order es en mayúsculas.
  const orderId = (body?.data?.id !== undefined ? String(body.data.id) : (dataId ?? "")).toUpperCase();
  if (type !== "order" || !ORDER_ID.test(orderId) || orderId.toLowerCase() !== dataId?.toLowerCase()) return reply(200, { ignored: true });

  const order = await fetchOrder(orderId, env.MERCADOPAGO_ACCESS_TOKEN);
  if (order === "not_found") return reply(200, { ignored: "order_not_found" });
  if (!order) return reply(502, { error: "provider_unavailable" });
  if (order.id !== orderId) return reply(200, { ignored: "id_mismatch" });

  const out = await applyOrder(order, env.MERCADOPAGO_ACCESS_TOKEN, "webhook");
  if (out.kind === "error") return reply(500, { error: "apply_failed" });
  if (out.kind === "ignored") {
    console.warn(JSON.stringify({ event: "mp_webhook_ignored", reason: out.reason }));
    return reply(200, { ignored: out.reason });
  }
  if (["amount_mismatch", "unknown_payment"].includes(out.result)) console.warn(JSON.stringify({ event: "mp_webhook_anomaly", result: out.result }));
  scheduleEmailFlush();
  return reply(200, { result: out.result });
}
