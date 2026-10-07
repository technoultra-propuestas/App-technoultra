/**
 * Estado de un pago tal como lo ve la persona (nunca se nombra al proveedor). Se deriva en el SERVIDOR de las filas de `payments`:
 * el navegador no decide si se puede pagar. La base de datos impide además crear dos pagos activos del mismo concepto.
 *
 *   pending  → «Pago en validación»  (hay un pago iniciado que aún no confirma el proveedor; no se ofrece «Pagar» otra vez)
 *   approved → «Pago confirmado»
 *   rejected / cancelled → «Pago rechazado» (se puede reintentar)
 *   expired  → «Pago vencido» (se puede iniciar uno nuevo)
 *   refunded → «Pago reembolsado»
 */
export type DbPaymentStatus = "pending" | "approved" | "rejected" | "cancelled" | "refunded" | "expired";
export type PaymentRow = { status: DbPaymentStatus; provider: string; created_at: string };
export type PaymentUi = "none" | "validating" | "confirmed" | "rejected" | "expired" | "refunded";

export const PAYMENT_LABEL: Record<PaymentUi, string> = {
  none: "Pendiente de pago",
  validating: "Pago en validación",
  confirmed: "Pago confirmado",
  rejected: "Pago rechazado",
  expired: "Pago vencido",
  refunded: "Pago reembolsado",
};

export const PAYMENT_MESSAGE: Record<PaymentUi, string> = {
  none: "",
  validating: "Estamos validando tu pago. Te avisaremos cuando quede confirmado.",
  confirmed: "Pago confirmado.",
  rejected: "El pago no se completó. Puedes intentarlo de nuevo.",
  expired: "El pago venció. Puedes iniciar uno nuevo.",
  refunded: "Este pago fue reembolsado.",
};

/**
 * Resultado para UN concepto (diagnóstico, servicio o cotización). `settled` = el concepto ya figura pagado en su propia fila
 * (tickets.prepaid_at, diagnosis_credits o quotes.paid_at): es la fuente de verdad aunque la fila del pago no se vea.
 */
export function derivePaymentUi(rows: PaymentRow[], settled: boolean): { state: PaymentUi; canPay: boolean; canResume: boolean } {
  if (settled || rows.some((r) => r.status === "approved")) return { state: "confirmed", canPay: false, canResume: false };
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const latest = sorted[0];
  if (!latest) return { state: "none", canPay: true, canResume: false };
  switch (latest.status) {
    case "pending":
      // Un pago manual pendiente no existe (nace aprobado); un pago en línea pendiente se muestra «en validación».
      return { state: "validating", canPay: false, canResume: true };
    case "refunded":
      return { state: "refunded", canPay: false, canResume: false };
    case "expired":
      return { state: "expired", canPay: true, canResume: false };
    default:
      return { state: "rejected", canPay: true, canResume: false };
  }
}

/** Texto del resultado al volver del pago (parámetro `?pago=`), sin mencionar al proveedor. */
export function returnMessage(result: string | undefined): { tone: "ok" | "error"; text: string } | null {
  switch (result) {
    case "exito":
    case "pendiente":
      return { tone: "ok", text: "Estamos validando tu pago. Te avisaremos cuando quede confirmado." };
    case "fallo":
      return { tone: "error", text: "El pago no se completó. Puedes intentarlo de nuevo." };
    default:
      return null;
  }
}
