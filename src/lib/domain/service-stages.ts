import type { PaymentUi } from "@/lib/payments/state";

/**
 * Etapas del servicio y del pago tal como se dibujan. TODO se deriva de hechos ya verificados en el servidor (estado del ticket,
 * pagos, diagnóstico, cotización): ninguna etapa avanza porque se inició un pago ni por una URL de retorno.
 */
export type StageState = "done" | "current" | "pending";
export type StageKey = "request" | "payment" | "diagnosis" | "quote" | "repair" | "delivery";
export type Stage = { key: StageKey; label: string; state: StageState; at: string | null };

export type StageFacts = {
  status: string;
  /** El servicio cobra algo antes de avanzar (diagnóstico o pago inmediato). */
  paymentApplies: boolean;
  paymentConfirmed: boolean;
  /** Servicio de precio fijo con pago inmediato: no tiene diagnóstico ni cotización. */
  immediate: boolean;
  diagnosisFinalized: boolean;
  quoteStatus: string | null;
  /** Fechas verificadas (null = aún no ocurrió). */
  dates: { request: string | null; payment: string | null; diagnosis: string | null; quote: string | null; repairDone: string | null; delivered: string | null };
};

const LABEL: Record<StageKey, string> = {
  request: "Solicitud",
  payment: "Pago",
  diagnosis: "Diagnóstico",
  quote: "Cotización",
  repair: "Reparación",
  delivery: "Entrega",
};

const AFTER_APPROVAL = ["in_service", "awaiting_part", "testing", "ready", "delivered"];

export function serviceStages(f: StageFacts): Stage[] {
  const cancelled = f.status === "cancelled";
  const keys: StageKey[] = ["request"];
  if (f.paymentApplies) keys.push("payment");
  if (!f.immediate) keys.push("diagnosis", "quote");
  keys.push("repair", "delivery");
  const done: Record<StageKey, boolean> = {
    request: true,
    payment: f.paymentConfirmed,
    diagnosis: f.diagnosisFinalized || ["awaiting_approval", ...AFTER_APPROVAL].includes(f.status),
    quote: f.quoteStatus === "approved" || AFTER_APPROVAL.includes(f.status),
    repair: ["ready", "delivered"].includes(f.status),
    delivery: f.status === "delivered",
  };
  const at: Record<StageKey, string | null> = {
    request: f.dates.request,
    payment: f.dates.payment,
    diagnosis: f.dates.diagnosis,
    quote: f.dates.quote,
    repair: f.dates.repairDone,
    delivery: f.dates.delivered,
  };
  let currentTaken = false;
  return keys.map((key) => {
    if (done[key]) return { key, label: LABEL[key], state: "done" as const, at: at[key] };
    // Un servicio cancelado no tiene «etapa actual»: lo que no ocurrió queda pendiente.
    const state: StageState = !cancelled && !currentTaken ? "current" : "pending";
    if (state === "current") currentTaken = true;
    return { key, label: LABEL[key], state, at: null };
  });
}

/** Línea de tiempo EXCLUSIVA del pago: iniciado → en validación → confirmado, o el resultado real si no se completó. */
export type PayStep = { key: "started" | "validating" | "confirmed"; label: string; state: "done" | "current" | "pending" | "failed" | "unknown" };

export function paymentSteps(state: PaymentUi, opts: { unverified?: boolean } = {}): PayStep[] {
  const step = (key: PayStep["key"], label: string, s: PayStep["state"]): PayStep => ({ key, label, state: s });
  switch (state) {
    case "none":
      return [step("started", "Pago iniciado", "pending"), step("validating", "En validación", "pending"), step("confirmed", "Confirmado", "pending")];
    case "validating":
      return [step("started", "Pago iniciado", "done"), step("validating", opts.unverified ? "Sin verificar" : "En validación", opts.unverified ? "unknown" : "current"), step("confirmed", "Confirmado", "pending")];
    case "confirmed":
      return [step("started", "Pago iniciado", "done"), step("validating", "En validación", "done"), step("confirmed", "Confirmado", "done")];
    case "rejected":
      return [step("started", "Pago iniciado", "done"), step("validating", "Rechazado", "failed"), step("confirmed", "Confirmado", "pending")];
    case "cancelled":
      return [step("started", "Pago iniciado", "done"), step("validating", "Cancelado", "failed"), step("confirmed", "Confirmado", "pending")];
    case "expired":
      return [step("started", "Pago iniciado", "done"), step("validating", "Vencido", "failed"), step("confirmed", "Confirmado", "pending")];
    case "refunded":
      return [step("started", "Pago iniciado", "done"), step("validating", "En validación", "done"), step("confirmed", "Reembolsado", "failed")];
  }
}

/** Bloque «¿Qué sigue?»: una frase que corresponde al estado REAL del pago y del ticket (sin plazos prometidos). */
export function whatsNext(p: { pay: PaymentUi; unverified?: boolean; ticketStatus: string; modality: string; hasReception: boolean; diagnosisReady: boolean }): string | null {
  if (p.ticketStatus === "cancelled") return null;
  if (p.pay === "validating") return p.unverified ? "Estamos comprobando el estado del pago. No realices otro pago mientras verificamos." : "Estamos confirmando el pago. No necesitas realizar otra acción.";
  if (p.pay === "rejected" || p.pay === "cancelled" || p.pay === "expired") return "Cuando el pago quede confirmado, continuaremos con tu servicio.";
  if (p.pay === "none") return null;
  switch (p.ticketStatus) {
    case "received":
      if (p.modality === "home") return "Nuestro equipo coordinará contigo la visita.";
      if (p.modality === "pickup") return "Nuestro equipo coordinará contigo la recogida del equipo.";
      if (p.modality === "remote") return "Un técnico te contactará para iniciar el soporte remoto.";
      return p.hasReception ? "Ya tenemos tu equipo: pronto empieza el diagnóstico." : "Te indicaremos cómo coordinar la entrega del equipo.";
    case "diagnosing":
      return p.diagnosisReady ? "Tu diagnóstico está listo para que lo revises." : "Nuestro técnico está revisando tu equipo.";
    case "awaiting_approval":
      return "Revisa la cotización y elige cómo deseas continuar.";
    case "awaiting_part":
      return "Estamos esperando un repuesto para continuar con tu reparación.";
    case "in_service":
    case "testing":
      return "Estamos trabajando en tu equipo.";
    case "ready":
      return "Tu equipo está listo para coordinar la entrega.";
    default:
      return null;
  }
}
