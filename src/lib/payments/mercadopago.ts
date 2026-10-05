import { createHmac, timingSafeEqual } from "node:crypto";

export type PaymentStatus = "pending" | "approved" | "rejected" | "cancelled" | "refunded" | "expired";

/** Estados de Mercado Pago → estados internos. Cualquier valor desconocido se trata como pendiente (nunca como aprobado). */
export function mapStatus(mp: string | undefined | null): PaymentStatus {
  switch (mp) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    case "refunded":
    case "charged_back":
      return "refunded";
    default:
      return "pending"; // pending, in_process, authorized, in_mediation, desconocidos
  }
}

/**
 * Valida la cabecera x-signature de las notificaciones de Mercado Pago:
 * manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" firmado con HMAC-SHA256 y el secreto del webhook.
 * Comparación en tiempo constante y ventana de validez de la marca de tiempo.
 */
export function verifyWebhookSignature(p: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
  nowMs?: number;
  toleranceMs?: number;
}): boolean {
  if (!p.xSignature || !p.dataId || !p.secret) return false;
  const parts = Object.fromEntries(
    p.xSignature.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  const tsMs = ts.length <= 10 ? Number(ts) * 1000 : Number(ts);
  const tolerance = p.toleranceMs ?? 24 * 3600_000;
  if (Math.abs((p.nowMs ?? Date.now()) - tsMs) > tolerance) return false;
  const id = /^[A-Za-z0-9]+$/.test(p.dataId) ? p.dataId.toLowerCase() : p.dataId;
  const manifest = `id:${id};${p.xRequestId ? `request-id:${p.xRequestId};` : ""}ts:${ts};`;
  const expected = createHmac("sha256", p.secret).update(manifest).digest();
  const given = Buffer.from(v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type MpPayment = {
  id: number | string;
  status: string;
  status_detail?: string;
  transaction_amount: number;
  currency_id: string;
  external_reference: string | null;
  date_last_updated?: string;
};

const API = "https://api.mercadopago.com";

/** Consulta el pago directamente a Mercado Pago: NUNCA se confía en el cuerpo de la notificación ni en query params. */
export async function fetchPayment(id: string, accessToken: string): Promise<MpPayment | null> {
  try {
    const res = await fetch(`${API}/v1/payments/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as MpPayment) : null;
  } catch {
    return null;
  }
}

export type PreferenceInput = {
  externalReference: string;
  idempotencyKey: string;
  items: { id: string; title: string; quantity: number; unit_price: number }[];
  payerEmail: string | null;
  appUrl: string;
  orderId: string;
  expiresAt: Date | null;
};

export async function createPreference(input: PreferenceInput, accessToken: string): Promise<{ id: string; init_point: string } | null> {
  const back = `${input.appUrl}/c/pedidos/${input.orderId}`;
  try {
    const res = await fetch(`${API}/checkout/preferences`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({
        items: input.items.map((i) => ({ ...i, title: i.title.slice(0, 250), currency_id: "COP" })),
        payer: input.payerEmail ? { email: input.payerEmail } : undefined,
        external_reference: input.externalReference,
        notification_url: `${input.appUrl}/api/webhooks/mercadopago`,
        back_urls: { success: `${back}?pago=exito`, pending: `${back}?pago=pendiente`, failure: `${back}?pago=fallo` },
        auto_return: "approved",
        statement_descriptor: "TECHNOULTRA",
        expires: Boolean(input.expiresAt),
        ...(input.expiresAt ? { expiration_date_to: input.expiresAt.toISOString() } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error("mp.preference", res.status);
      return null;
    }
    const json = (await res.json()) as { id?: string; init_point?: string };
    return json.id && json.init_point ? { id: json.id, init_point: json.init_point } : null;
  } catch {
    return null;
  }
}
