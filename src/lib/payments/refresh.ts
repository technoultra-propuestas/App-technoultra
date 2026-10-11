import "server-only";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchOrder } from "./mercadopago";
import { applyOrder } from "./orders";
import type { DbPaymentStatus } from "./state";

/**
 * Resultado de verificar un pago AHORA, con la API del proveedor:
 *  - `status`: el estado persistido en la base de datos DESPUÉS de verificar (la única fuente de verdad).
 *  - `verified`: false si no se pudo consultar al proveedor (credenciales ausentes, API caída, id no resoluble). Entonces el estado
 *    NO cambia (un pago pendiente sigue pendiente; jamás se marca fallido ni aprobado por no poder verificar).
 */
export type RefreshResult = { status: DbPaymentStatus; verified: boolean; changed: boolean };

/**
 * Consulta la Order del pago a Mercado Pago con el token del servidor y la aplica por el MISMO camino seguro del webhook
 * (`applyOrder` → `apply_payment_event`: aplicación, moneda, monto y referencia verificados; idempotente; estados monotónicos).
 * Cubre las dos causas de una pantalla «en validación» eterna: webhook que no llega (o llega tarde) y retorno del cliente sin
 * ninguna comprobación. Seguro de llamar muchas veces: un evento repetido no duplica nada.
 */
export async function refreshPaymentStatus(paymentId: string): Promise<RefreshResult | null> {
  const admin = createAdminClient();
  const { data: pay } = await admin.from("payments").select("id, status, provider, external_id").eq("id", paymentId).maybeSingle();
  if (!pay) return null;
  const before = pay.status as DbPaymentStatus;
  // Solo se consulta lo que aún puede cambiar: un estado final no se vuelve a preguntar.
  if (pay.provider !== "mercadopago" || before !== "pending" || !pay.external_id) return { status: before, verified: true, changed: false };

  let token: string;
  try {
    token = serverEnv.mercadopago().MERCADOPAGO_ACCESS_TOKEN;
  } catch {
    return { status: before, verified: false, changed: false };
  }
  const order = await fetchOrder(pay.external_id, token);
  if (!order || order === "not_found") {
    console.warn(JSON.stringify({ event: "mp_refresh_unverified", reason: order === "not_found" ? "order_not_found" : "provider_unavailable" }));
    return { status: before, verified: false, changed: false };
  }
  const out = await applyOrder(order, token, "return");
  if (out.kind !== "applied") {
    console.warn(JSON.stringify({ event: "mp_refresh_not_applied", kind: out.kind }));
    return { status: before, verified: false, changed: false };
  }
  const { data: after } = await admin.from("payments").select("status").eq("id", paymentId).maybeSingle();
  const status = (after?.status ?? before) as DbPaymentStatus;
  return { status, verified: true, changed: status !== before };
}
