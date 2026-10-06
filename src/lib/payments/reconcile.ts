import "server-only";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapStatus, searchPaymentsByReference } from "./mercadopago";

export type ReconcileResult = { configured: boolean; checked: number; applied: number };

/**
 * Conciliación (cron): para pagos en línea que siguen "pendientes" tras 10 minutos, pregunta a Mercado Pago por su estado real y lo
 * aplica con el mismo camino seguro del webhook (apply_payment_event: monto/moneda/referencia verificados, idempotente). Cubre
 * notificaciones perdidas. Sin credenciales no hace nada. Solo lectura hacia Mercado Pago.
 */
export async function reconcilePendingPayments(limit = 20): Promise<ReconcileResult> {
  let token: string;
  try {
    token = serverEnv.mercadopago().MERCADOPAGO_ACCESS_TOKEN;
  } catch {
    return { configured: false, checked: 0, applied: 0 };
  }
  const admin = createAdminClient();
  const olderThan = new Date(Date.now() - 10 * 60_000).toISOString();
  const newerThan = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data } = await admin
    .from("payments")
    .select("id, external_reference")
    .eq("provider", "mercadopago")
    .eq("status", "pending")
    .not("external_reference", "is", null)
    .lt("created_at", olderThan)
    .gt("created_at", newerThan)
    .order("created_at", { ascending: true })
    .limit(limit);
  let applied = 0;
  for (const p of data ?? []) {
    const found = (await searchPaymentsByReference(p.external_reference as string, token))[0];
    if (!found || mapStatus(found.status) === "pending") continue;
    const { data: r, error } = await admin.rpc("apply_payment_event", {
      p_provider: "mercadopago",
      p_event_id: `recon:${found.id}:${found.status}:${found.date_last_updated ?? ""}`,
      p_event_type: "reconciliation",
      p_payload: { id: found.id, status: found.status, amount: found.transaction_amount, currency: found.currency_id },
      p_signature_valid: true, // el estado se leyó directamente de la API de Mercado Pago con el token del servidor
      p_external_reference: p.external_reference as string,
      p_external_id: String(found.id),
      p_status: mapStatus(found.status),
      p_amount: found.transaction_amount,
      p_currency: found.currency_id,
    });
    if (error) console.error("mp.reconcile.apply", error.code);
    else if (r && !["duplicate", "noop"].includes(String(r))) applied++;
  }
  return { configured: true, checked: data?.length ?? 0, applied };
}
