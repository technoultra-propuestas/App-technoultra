/**
 * Estado de un pago tal como lo ve la persona (nunca se nombra al proveedor). Se deriva en el SERVIDOR de las filas de `payments`:
 * el navegador no decide si se puede pagar. La base de datos impide además crear dos pagos activos del mismo concepto.
 *
 *   pending  → «Pago en validación»  (hay un pago iniciado que aún no confirma el proveedor; no se ofrece «Pagar» otra vez)
 *   approved → «Pago confirmado»
 *   rejected → «Pago rechazado» (se puede reintentar)
 *   cancelled → «Pago cancelado» (la persona lo canceló; se puede reintentar)
 *   expired  → «Pago vencido» (se puede iniciar uno nuevo)
 *   refunded → «Pago reembolsado»
 */
export type DbPaymentStatus = "pending" | "approved" | "rejected" | "cancelled" | "refunded" | "expired";
export type PaymentRow = { status: DbPaymentStatus; provider: string; created_at: string };
export type PaymentUi = "none" | "validating" | "confirmed" | "rejected" | "cancelled" | "expired" | "refunded";

export const PAYMENT_LABEL: Record<PaymentUi, string> = {
  none: "Pendiente de pago",
  validating: "Pago en validación",
  confirmed: "Pago confirmado",
  rejected: "Pago rechazado",
  cancelled: "Pago cancelado",
  expired: "Pago vencido",
  refunded: "Pago reembolsado",
};

export const PAYMENT_MESSAGE: Record<PaymentUi, string> = {
  none: "",
  validating: "Estamos confirmando tu pago. No necesitas volver a pagar; te avisaremos cuando quede confirmado.",
  confirmed: "Pago confirmado.",
  rejected: "No se pudo completar tu pago. Puedes intentarlo nuevamente.",
  cancelled: "Cancelaste el pago. Cuando quieras, puedes intentarlo nuevamente.",
  expired: "El pago venció. Puedes iniciar uno nuevo.",
  refunded: "Este pago fue reembolsado.",
};

/**
 * Resultado para UN concepto (diagnóstico, servicio o cotización). `settled` = el concepto ya figura pagado en su propia fila
 * (tickets.prepaid_at, diagnosis_credits o quotes.paid_at): es la fuente de verdad aunque la fila del pago no se vea.
 */
/** No se pudo determinar el estado del pago (p. ej. regresaste del pago sin respuesta verificable). Nunca se afirma que falló ni que se cobró. */
export const PAYMENT_UNKNOWN_MESSAGE =
  "No pudimos verificar el estado de tu pago. Si ya pagaste, no vuelvas a pagar: lo revisaremos y te avisaremos. Si no pagaste, puedes intentarlo nuevamente.";

export function derivePaymentUi(rows: PaymentRow[], settled: boolean): { state: PaymentUi; canPay: boolean; canResume: boolean } {
  if (settled || rows.some((r) => r.status === "approved")) return { state: "confirmed", canPay: false, canResume: false };
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const latest = sorted[0];
  if (!latest) return { state: "none", canPay: true, canResume: false };
  switch (latest.status) {
    case "pending":
      // Un pago manual pendiente no existe (nace aprobado); un pago en línea pendiente se muestra «en validación».
      return { state: "validating", canPay: false, canResume: latest.provider === "mercadopago" };
    case "refunded":
      return { state: "refunded", canPay: false, canResume: false };
    case "expired":
      return { state: "expired", canPay: true, canResume: false };
    case "cancelled":
      return { state: "cancelled", canPay: true, canResume: false };
    default:
      return { state: "rejected", canPay: true, canResume: false };
  }
}

/**
 * Texto al volver del pago (parámetro `?pago=`), sin mencionar al proveedor. El parámetro NO es una fuente de verdad (lo puede escribir cualquiera):
 * solo orienta el texto; el estado real es el de la base de datos (`state`). Nunca muestra «falló» por la URL.
 */
export function returnMessage(result: string | undefined, state?: PaymentUi): { tone: "ok" | "error"; text: string } | null {
  switch (result) {
    case "exito":
    case "pendiente":
      return state === "confirmed" ? null : { tone: "ok", text: PAYMENT_MESSAGE.validating };
    case "fallo":
      // Si la base de datos ya explica el estado (validando, rechazado, cancelado, vencido, confirmado), la tarjeta lo muestra: no se duplica.
      if (state && state !== "none") return null;
      return { tone: "error", text: PAYMENT_UNKNOWN_MESSAGE };
    default:
      return null;
  }
}
