import { derivePaymentUi, type DbPaymentStatus } from "@/lib/payments/state";

/**
 * Vista del cobro de UN concepto para el personal (diagnóstico, servicio o cotización). Se deriva en el servidor de las filas de
 * `payments`: si ya hay un cobro confirmado o en validación NUNCA se ofrece «Registrar pago». La base de datos lo impide además
 * (índices únicos de cobro activo + comprobaciones de `record_manual_service_payment_v2`).
 */
export type StaffPaymentRow = {
  id: string;
  status: DbPaymentStatus;
  provider: string;
  method: string | null;
  amount: number;
  reference: string | null;
  note: string | null;
  approved_at: string | null;
  created_at: string;
  voucher_evidence_id: string | null;
};

export type ManualMethod = "cash" | "datafono" | "bank_transfer" | "other";
export const MANUAL_METHODS: { value: ManualMethod; label: string; hint: string }[] = [
  { value: "cash", label: "Efectivo", hint: "Se confirma al registrar." },
  { value: "datafono", label: "Datáfono", hint: "Requiere la foto del comprobante." },
  { value: "bank_transfer", label: "Transferencia", hint: "Queda pendiente hasta que administración la valide." },
  { value: "other", label: "Otro medio", hint: "Se confirma al registrar; deja la referencia." },
];

export function methodLabel(provider: string, method: string | null): string {
  if (provider === "mercadopago") return "Mercado Pago";
  return MANUAL_METHODS.find((m) => m.value === method)?.label ?? "Manual";
}

export type StaffPaymentView = {
  state: "confirmed" | "validating" | "none";
  /** Solo si no hay cobro confirmado ni en curso. */
  canRegister: boolean;
  confirmed: StaffPaymentRow | null;
  pending: StaffPaymentRow | null;
  /** Una transferencia manual pendiente se puede validar (SUPERADMIN). */
  pendingIsManual: boolean;
};

export function staffPaymentView(rows: StaffPaymentRow[], settled: boolean): StaffPaymentView {
  const ui = derivePaymentUi(rows, settled);
  const confirmed = rows.find((r) => r.status === "approved") ?? null;
  const pending = ui.state === "validating" ? ([...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).find((r) => r.status === "pending") ?? null) : null;
  if (ui.state === "confirmed") return { state: "confirmed", canRegister: false, confirmed, pending: null, pendingIsManual: false };
  if (ui.state === "validating") return { state: "validating", canRegister: false, confirmed: null, pending, pendingIsManual: pending?.provider === "manual" };
  return { state: "none", canRegister: true, confirmed: null, pending: null, pendingIsManual: false };
}

/** Reglas de captura del formulario manual (la función SQL las vuelve a comprobar). */
export function manualPaymentProblem(method: ManualMethod, voucherId: string | null): string | null {
  if (method === "datafono" && !voucherId) return "Sube la foto del comprobante del datáfono para registrar este pago.";
  return null;
}

export const PAYMENT_ERRORS: Record<string, string> = {
  voucher_required: "Sube la foto del comprobante del datáfono para registrar este pago.",
  voucher_invalid: "El comprobante no es válido para este ticket. Súbelo de nuevo.",
  voucher_reused: "Ese comprobante ya se usó en otro pago.",
  payment_in_validation: "Ya hay un pago en validación para este concepto. Espera su confirmación.",
  diagnosis_already_paid: "El diagnóstico ya está pagado.",
  quote_already_paid: "La cotización ya está pagada.",
  service_already_paid: "El servicio ya está pagado.",
  payment_not_pending: "Ese pago ya no está pendiente.",
  reason_required: "Escribe el motivo (mínimo 3 letras).",
  forbidden: "No tienes permiso para registrar este pago.",
  quote_not_payable: "La cotización debe estar aprobada para cobrarla.",
  ticket_closed: "El ticket está cerrado.",
};
