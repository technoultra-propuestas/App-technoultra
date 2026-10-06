import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mercado Pago · Checkout Pro con **Orders API** (`POST /v1/orders`, `type=online`, `processing_mode=manual`).
 * TechnoUltra es la fuente de verdad del pago: el importe sale de la base de datos, el navegador nunca decide el estado, y un pago
 * solo pasa a «aprobado» tras (1) webhook con firma válida, (2) consulta de la Order a la API con el token del servidor y
 * (3) verificación de monto, moneda, referencia y aplicación (ver `orders.ts` y la función SQL `apply_payment_event`).
 *
 * Notas verificadas contra la API real (Colombia): los importes en COP van como texto SIN decimales ("30100"); los ítems solo admiten
 * `title`, `unit_price`, `quantity` (y similares), no `total_amount` ni `unit_measure`.
 */

export type PaymentStatus = "pending" | "approved" | "rejected" | "cancelled" | "refunded" | "expired";

/**
 * Estado de la Order de Mercado Pago → estado interno. Todo valor desconocido es «pendiente» (jamás «aprobado»).
 * Solo `processed` + `accredited` aprueba. Un reembolso parcial NO cambia el estado (el pago sigue aprobado).
 */
export function mapOrderStatus(status: string | undefined | null, detail?: string | null): PaymentStatus {
  switch (status) {
    case "processed":
      if (detail === "accredited" || detail === "partially_refunded") return "approved";
      if (detail === "refunded") return "refunded";
      return "pending";
    case "refunded":
      return "refunded";
    case "failed":
      return "rejected";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    default:
      return "pending"; // created, processing, action_required, desconocidos
  }
}

/**
 * Valida la cabecera x-signature de las notificaciones de Mercado Pago:
 * manifest = "id:<data.id en minúsculas>;request-id:<x-request-id>;ts:<ts>;" firmado con HMAC-SHA256 y el secreto del webhook.
 * Comparación en tiempo constante y ventana de validez de la marca de tiempo (anti-repetición; la idempotencia cubre el resto).
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

const API = "https://api.mercadopago.com";
export const ORDER_ID = /^ORD[0-9A-Z]{10,48}$/;

/** El id de aplicación va dentro del access token (`APP_USR-<appId>-…`): permite comprobar que una Order es de NUESTRA aplicación. */
export function applicationIdFromToken(token: string): string | null {
  const m = /^(?:APP_USR|TEST)-(\d{6,20})-/.exec(token);
  return m ? m[1] : null;
}

export type MpOrder = {
  id: string;
  status: string;
  status_detail?: string;
  external_reference?: string | null;
  total_amount: string;
  total_paid_amount?: string;
  currency?: string;
  last_updated_date?: string;
  integration_data?: { application_id?: string };
  transactions?: { payments?: { id?: string; amount?: string; paid_amount?: string; status?: string; status_detail?: string }[] };
};

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, accept: "application/json" });

/** Consulta la Order directamente a Mercado Pago: NUNCA se confía en el cuerpo de la notificación ni en query params. */
export async function fetchOrder(id: string, token: string): Promise<MpOrder | "not_found" | null> {
  if (!ORDER_ID.test(id)) return "not_found";
  try {
    const res = await fetch(`${API}/v1/orders/${encodeURIComponent(id)}`, { headers: authHeaders(token), signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (res.status === 404) return "not_found";
    if (!res.ok) {
      console.error("mp.order.get", { status: res.status });
      return null;
    }
    return (await res.json()) as MpOrder;
  } catch {
    return null;
  }
}

/** COP no tiene decimales: importe como texto entero. Devuelve null si el valor no es un entero positivo válido. */
export function copAmount(n: number): string | null {
  return Number.isFinite(n) && n > 0 && Number.isInteger(n) && n < 1e10 ? String(n) : null;
}

export type OrderInput = {
  externalReference: string;
  /** Una clave nueva por intento de creación (UUID). Para el mismo pago puede reutilizarse: Mercado Pago devuelve la misma Order. */
  idempotencyKey: string;
  items: { title: string; quantity: number; unit_price: number }[];
  /** Total calculado por el servidor; debe ser exactamente la suma de unit_price × quantity. */
  totalAmount: number;
  description: string;
  payerEmail: string | null;
  appUrl: string;
  /** Ruta interna a la que vuelve el cliente tras pagar (p. ej. /c/pedidos/<id> o /c/tickets/<id>). Solo informa: no confirma nada. */
  backPath: string;
  expiresAt: Date | null;
};

export type CreatedOrder = { id: string; checkoutUrl: string };

/** Duración ISO 8601 hasta `expiresAt` (días enteros si es posible, si no horas). Mínimo 1 hora. */
export function expirationDuration(expiresAt: Date, now = Date.now()): string {
  const hours = Math.max(1, Math.round((expiresAt.getTime() - now) / 3_600_000));
  return hours % 24 === 0 ? `P${hours / 24}D` : `PT${hours}H`;
}

/** Crea la Order de Checkout Pro. Devuelve null ante cualquier fallo (el llamador muestra un error seguro; el detalle queda en el registro). */
export async function createOrder(input: OrderInput, token: string): Promise<CreatedOrder | null> {
  const total = copAmount(input.totalAmount);
  const lines = input.items.map((i) => ({ title: i.title.slice(0, 250), quantity: i.quantity, unit_price: copAmount(i.unit_price) }));
  const sum = input.items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  // Coherencia obligatoria: total = Σ(precio × cantidad), enteros positivos. Si no cuadra, NO se envía nada a Mercado Pago.
  if (!total || lines.some((l) => !l.unit_price || !Number.isInteger(l.quantity) || l.quantity < 1) || sum !== input.totalAmount) {
    console.error("mp.order.invalid_amounts");
    return null;
  }
  const back = `${input.appUrl}${input.backPath}`;
  try {
    const res = await fetch(`${API}/v1/orders`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json", "X-Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({
        type: "online",
        processing_mode: "manual",
        total_amount: total,
        external_reference: input.externalReference,
        description: input.description.slice(0, 150),
        payer: input.payerEmail ? { email: input.payerEmail } : undefined,
        config: { online: { success_url: `${back}?pago=exito`, pending_url: `${back}?pago=pendiente`, failure_url: `${back}?pago=fallo`, auto_return: "approved" } },
        ...(input.expiresAt ? { expiration_time: expirationDuration(input.expiresAt) } : {}),
        items: lines.map((l) => ({ title: l.title, quantity: l.quantity, unit_price: l.unit_price })),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const retryAfter = res.headers.get("retry-after");
      const err = (await res.json().catch(() => ({}))) as { errors?: { code?: string }[]; message?: string };
      console.error("mp.order.create", { status: res.status, code: err.errors?.[0]?.code ?? err.message ?? null, retryAfter });
      return null;
    }
    const o = (await res.json()) as MpOrder & { checkout_url?: string };
    let host = "";
    try {
      host = new URL(o.checkout_url ?? "").hostname;
    } catch {
      /* url inválida */
    }
    // La respuesta debe corresponder EXACTAMENTE a lo pedido; si no, no se redirige a nadie.
    if (!ORDER_ID.test(o.id ?? "") || !/(^|\.)mercadopago\.com(\.[a-z]{2})?$/.test(host) || o.external_reference !== input.externalReference || o.total_amount !== total || (o.currency && o.currency !== "COP")) {
      console.error("mp.order.unexpected_response");
      return null;
    }
    return { id: o.id, checkoutUrl: o.checkout_url as string };
  } catch {
    return null;
  }
}

/** Cancela una Order sin pagar (p. ej. al vencer el pago interno). Mejor esfuerzo; un error nunca rompe el flujo. */
export async function cancelOrder(id: string, token: string): Promise<boolean> {
  if (!ORDER_ID.test(id)) return false;
  try {
    const res = await fetch(`${API}/v1/orders/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      headers: { ...authHeaders(token), "X-Idempotency-Key": crypto.randomUUID() },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
