import "server-only";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelOrder, fetchOrder } from "./mercadopago";
import { applyOrder } from "./orders";

export type ReconcileResult = { configured: boolean; checked: number; applied: number; cancelled: number };

/**
 * Conciliación (cron): para pagos en línea que siguen «pendientes» tras 10 minutos, consulta la Order a Mercado Pago (por el id
 * guardado al crearla) y aplica su estado real por el mismo camino seguro del webhook. Cubre notificaciones perdidas.
 * También cancela en Mercado Pago las Orders cuyo pago interno ya venció, para que nadie pague algo que ya no podemos acreditar.
 * Sin credenciales no hace nada. Solo lectura salvo la cancelación de Orders vencidas.
 */
export async function reconcilePendingPayments(limit = 20): Promise<ReconcileResult> {
  let token: string;
  try {
    token = serverEnv.mercadopago().MERCADOPAGO_ACCESS_TOKEN;
  } catch {
    return { configured: false, checked: 0, applied: 0, cancelled: 0 };
  }
  const admin = createAdminClient();
  const olderThan = new Date(Date.now() - 10 * 60_000).toISOString();
  const newerThan = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data } = await admin
    .from("payments")
    .select("id, external_id")
    .eq("provider", "mercadopago")
    .eq("status", "pending")
    .not("external_id", "is", null)
    .lt("created_at", olderThan)
    .gt("created_at", newerThan)
    .order("created_at", { ascending: true })
    .limit(limit);
  let applied = 0;
  for (const p of data ?? []) {
    const order = await fetchOrder(p.external_id as string, token);
    if (!order || order === "not_found") continue;
    const out = await applyOrder(order, token, "reconciliation");
    if (out.kind === "applied" && !["duplicate", "noop"].includes(out.result)) applied++;
  }
  // Pagos vencidos internamente (48 h / expiración del pedido) con Order todavía abierta en Mercado Pago.
  const { data: expired } = await admin
    .from("payments")
    .select("external_id")
    .eq("provider", "mercadopago")
    .eq("status", "expired")
    .not("external_id", "is", null)
    .gt("updated_at", new Date(Date.now() - 3 * 24 * 3600_000).toISOString())
    .limit(limit);
  let cancelled = 0;
  for (const p of expired ?? []) if (await cancelOrder(p.external_id as string, token)) cancelled++;
  return { configured: true, checked: data?.length ?? 0, applied, cancelled };
}
