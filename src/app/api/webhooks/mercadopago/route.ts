import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { fetchPayment, mapStatus, verifyWebhookSignature } from "@/lib/payments/mercadopago";
import { scheduleEmailFlush } from "@/lib/email/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

const reply = (status: number, body: Record<string, unknown> = {}) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Notificaciones de Mercado Pago. Orden de seguridad:
 *  1) validar la firma x-signature (HMAC con el secreto del webhook);
 *  2) NO confiar en el cuerpo: consultar el pago a la API de Mercado Pago;
 *  3) aplicar el evento en base de datos de forma idempotente (monto/moneda/referencia verificados allí).
 * Respuestas: 401 firma inválida · 200 procesado o duplicado · 502 si el proveedor no responde (para que reintente).
 */
export async function POST(request: NextRequest) {
  let env: { MERCADOPAGO_ACCESS_TOKEN: string; MERCADOPAGO_WEBHOOK_SECRET: string };
  try {
    env = serverEnv.mercadopago();
  } catch {
    return reply(503, { error: "not_configured" });
  }
  const url = request.nextUrl;
  const body = (await request.json().catch(() => null)) as { type?: string; data?: { id?: string | number } } | null;
  const dataId = url.searchParams.get("data.id") ?? (body?.data?.id !== undefined ? String(body.data.id) : null);
  const type = url.searchParams.get("type") ?? body?.type ?? null;

  const valid = verifyWebhookSignature({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
    secret: env.MERCADOPAGO_WEBHOOK_SECRET,
  });
  if (!valid) return reply(401, { error: "invalid_signature" });
  if (type !== "payment" || !dataId || !/^[0-9]{1,20}$/.test(dataId)) return reply(200, { ignored: true });

  const payment = await fetchPayment(dataId, env.MERCADOPAGO_ACCESS_TOKEN);
  if (!payment) return reply(502, { error: "provider_unavailable" });
  if (!payment.external_reference) return reply(200, { ignored: "no_reference" });

  const { data, error } = await createAdminClient().rpc("apply_payment_event", {
    p_provider: "mercadopago",
    p_event_id: `${payment.id}:${payment.status}:${payment.date_last_updated ?? ""}`,
    p_event_type: "payment",
    // Solo se guardan los campos necesarios para auditoría (sin datos personales del pagador).
    p_payload: { id: payment.id, status: payment.status, status_detail: payment.status_detail, amount: payment.transaction_amount, currency: payment.currency_id },
    p_signature_valid: true,
    p_external_reference: payment.external_reference,
    p_external_id: String(payment.id),
    p_status: mapStatus(payment.status),
    p_amount: payment.transaction_amount,
    p_currency: payment.currency_id,
  });
  if (error) {
    console.error("mp.webhook.apply", error.code);
    return reply(500, { error: "apply_failed" });
  }
  scheduleEmailFlush();
  return reply(200, { result: data });
}
