import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { applicationIdFromToken, mapOrderStatus, type MpOrder, type PaymentStatus } from "./mercadopago";

export type ApplyOutcome =
  | { kind: "applied"; result: string }
  | { kind: "ignored"; reason: "no_reference" | "foreign_application" | "bad_currency" | "bad_amount" }
  | { kind: "error"; code: string };

const num = (v: unknown) => (v === undefined || v === null || v === "" ? NaN : Number(v));

/**
 * Convierte una Order (ya consultada a la API con el token del servidor) en el evento interno y lo aplica con
 * `apply_payment_event`: idempotente (payment_events único), con monto/moneda/referencia verificados en base de datos y estados
 * finales monotónicos (un pago aprobado no vuelve a pendiente por un webhook retrasado).
 *
 * - Aprobado exige `processed` + `accredited` y que lo PAGADO sea exactamente el total esperado.
 * - La Order debe pertenecer a nuestra aplicación (id dentro del access token) y estar en COP.
 */
export async function applyOrder(order: MpOrder, token: string, source: "webhook" | "reconciliation"): Promise<ApplyOutcome> {
  if (!order.external_reference) return { kind: "ignored", reason: "no_reference" };
  const app = applicationIdFromToken(token);
  if (app && order.integration_data?.application_id && order.integration_data.application_id !== app) return { kind: "ignored", reason: "foreign_application" };
  if (order.currency && order.currency !== "COP") return { kind: "ignored", reason: "bad_currency" };

  const status: PaymentStatus = mapOrderStatus(order.status, order.status_detail);
  const total = num(order.total_amount);
  let amount = total;
  if (status === "approved") {
    // Lo cobrado: total_paid_amount, o la suma de los pagos acreditados de la Order. Si no se puede establecer, no coincide (seguro).
    const paid = num(order.total_paid_amount);
    const sum = (order.transactions?.payments ?? []).reduce((s, p) => s + (num(p.paid_amount ?? p.amount) || 0), 0);
    amount = Number.isFinite(paid) ? paid : sum > 0 ? sum : 0;
  }
  if (!Number.isFinite(amount)) return { kind: "ignored", reason: "bad_amount" };

  const { data, error } = await createAdminClient().rpc("apply_payment_event", {
    p_provider: "mercadopago",
    p_event_id: `${order.id}:${order.status}:${order.status_detail ?? ""}:${order.last_updated_date ?? ""}`,
    p_event_type: `order.${order.status}`,
    // Solo lo necesario para auditar (sin datos personales del pagador).
    p_payload: { id: order.id, status: order.status, status_detail: order.status_detail ?? null, total: order.total_amount, paid: order.total_paid_amount ?? null, currency: order.currency ?? null, source },
    p_signature_valid: true, // el estado se leyó de la API con el token del servidor; la firma del webhook se validó antes
    p_external_reference: order.external_reference,
    p_external_id: order.id,
    p_status: status,
    p_amount: amount,
    p_currency: order.currency ?? "COP",
  });
  if (error) {
    console.error("mp.order.apply", { code: error.code, source });
    return { kind: "error", code: error.code ?? "unknown" };
  }
  return { kind: "applied", result: String(data) };
}
