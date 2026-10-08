"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { allow, TOO_MANY } from "@/lib/auth/rate-limit";
import { PAYMENT_ERRORS } from "@/lib/payments/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export type PaymentResult = { ok: boolean; message: string };

const registerSchema = z.object({
  ticketId: z.string().uuid(),
  kind: z.enum(["diagnosis", "service", "quote"]),
  ref: z.string().uuid(),
  method: z.enum(["cash", "datafono", "bank_transfer", "other"]),
  reference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
  voucherId: z.string().uuid().optional().or(z.literal("")),
});

function clean(code: string | undefined, message: string): string {
  return PAYMENT_ERRORS[message] ?? PAYMENT_ERRORS[code ?? ""] ?? "No pudimos registrar el pago. Revisa los datos e inténtalo de nuevo.";
}

/**
 * Registra un cobro manual (efectivo, datáfono, transferencia, otro). Técnico asignado o SUPERADMIN; el monto, el estado del concepto
 * y las duplicidades los resuelve la base de datos. El cliente/navegador solo aporta método, referencia y comprobante.
 */
export async function registerPaymentAction(_: PaymentResult | null, fd: FormData): Promise<PaymentResult> {
  const actor = await assertRole(["technician", "superadmin"]);
  const p = registerSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return { ok: false, message: "Revisa los datos del pago." };
  if (!(await allow("manual-payment", actor.id, 30, 3600))) return { ok: false, message: TOO_MANY };
  const { error } = await createAdminClient().rpc("record_manual_service_payment_v2", {
    p_actor: actor.id,
    p_kind: p.data.kind,
    p_ref: p.data.ref,
    p_method: p.data.method,
    p_reference: p.data.reference || undefined,
    p_note: p.data.note || undefined,
    p_voucher: p.data.voucherId || undefined,
  });
  if (error) {
    console.error("payment.manual", error.code, error.message);
    return { ok: false, message: clean(error.code, error.message) };
  }
  revalidatePath(`/b/tickets/${p.data.ticketId}`);
  return { ok: true, message: p.data.method === "bank_transfer" ? "Transferencia registrada. Queda pendiente de validación." : "Pago registrado." };
}

const confirmSchema = z.object({ ticketId: z.string().uuid(), paymentId: z.string().uuid() });
/** Valida una transferencia pendiente (solo SUPERADMIN). */
export async function confirmPaymentAction(fd: FormData): Promise<void> {
  const actor = await assertRole(["superadmin"]);
  const p = confirmSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const { error } = await createAdminClient().rpc("confirm_manual_payment", { p_actor: actor.id, p_payment: p.data.paymentId });
  if (error) console.error("payment.confirm", error.code, error.message);
  revalidatePath(`/b/tickets/${p.data.ticketId}`);
}

const cancelSchema = confirmSchema.extend({ reason: z.string().trim().min(3).max(200) });
/** Anula un intento pendiente (pago en línea abandonado o transferencia que no llegó). Solo SUPERADMIN, con motivo y auditoría. */
export async function cancelPaymentAction(fd: FormData): Promise<void> {
  const actor = await assertRole(["superadmin"]);
  const p = cancelSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const { error } = await createAdminClient().rpc("cancel_pending_payment", { p_actor: actor.id, p_payment: p.data.paymentId, p_reason: p.data.reason });
  if (error) console.error("payment.cancel", error.code, error.message);
  revalidatePath(`/b/tickets/${p.data.ticketId}`);
}
