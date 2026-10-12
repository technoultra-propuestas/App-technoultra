import { z } from "zod";

/**
 * Resumen económico de una cotización aprobada tal como lo calcula la BASE DE DATOS (`quote_payment_summary`, migración 43).
 * Esta capa solo lo valida y lo traduce a la pantalla: ningún importe se calcula ni se corrige en el navegador.
 */
const n = z.coerce.number();
const summarySchema = z.object({
  status: z.string(),
  code: z.string(),
  version: n,
  items_total: n,
  diagnosis_credit: n,
  base: n,
  paid: n,
  discount: n,
  balance: n,
  plan: z.enum(["deposit", "full"]).nullable(),
  approved_count: n,
  paid_in_full: z.boolean(),
  deposit_amount: n,
  deposit_remaining: n,
  full_discount: n,
  full_amount: n,
  pending_plan: z.enum(["deposit", "full", "balance"]).nullable(),
  pending_amount: n.nullable(),
  pending_provider: z.string().nullable(),
  pending_since: z.string().nullable(),
  can_choose: z.boolean(),
  can_pay_balance: z.boolean(),
  ticket_status: z.string().nullable(),
});
export type QuotePaySummary = z.infer<typeof summarySchema>;

export function parseQuoteSummary(raw: unknown): QuotePaySummary | null {
  const r = summarySchema.safeParse(raw);
  return r.success ? r.data : null;
}

export type QuotePlan = "deposit" | "full" | "balance";
export const PLAN_LABEL: Record<QuotePlan, string> = {
  deposit: "Anticipo del 50 %",
  full: "Pago total con 5 % de descuento",
  balance: "Saldo restante",
};

/**
 * Situación del cobro para elegir qué mostrar (una sola tarjeta principal):
 *  - nothing: no hay nada que cobrar (el crédito cubrió todo).
 *  - choose: aprobada, sin pagos: elegir anticipo o total.
 *  - validating: hay un cobro en validación (en línea o transferencia).
 *  - deposit_paid: anticipo confirmado, queda saldo.
 *  - paid: liquidada (saldo cero).
 */
export type QuotePayStage = "nothing" | "choose" | "validating" | "deposit_paid" | "paid";
export function quotePayStage(s: QuotePaySummary): QuotePayStage {
  if (s.base <= 0) return "nothing";
  if (s.pending_plan) return "validating";
  if (s.paid_in_full) return "paid";
  if (s.approved_count > 0) return "deposit_paid";
  return "choose";
}

/** El saldo se habilita al final de la intervención (pruebas o listo), como pide el flujo; antes solo se informa. */
export function balanceOpen(s: QuotePaySummary): boolean {
  return s.can_pay_balance && ["testing", "ready"].includes(s.ticket_status ?? "");
}

/** Errores de la base de datos → texto para el cliente (nunca el mensaje interno). */
export const QUOTE_PAY_RESULT: Record<string, string> = {
  plan_already_chosen: "Ya elegiste cómo pagar esta cotización.",
  payment_in_validation: "Ya hay un pago en validación. Espera su confirmación antes de intentar otro.",
  quote_already_paid: "Esta cotización ya está pagada.",
  nothing_to_pay: "No hay saldo por pagar en esta cotización.",
  quote_not_payable: "La cotización debe estar aprobada para pagarla.",
  plan_required: "Primero elige cómo quieres pagar.",
  ticket_closed: "Este servicio está cerrado.",
};
