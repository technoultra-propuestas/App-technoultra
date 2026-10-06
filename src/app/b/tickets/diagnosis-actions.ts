"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ ticketId: z.string().uuid(), method: z.enum(["cash", "bank_transfer", "other"]) });

/**
 * Registra el pago del diagnóstico (solo administración). El monto sale del snapshot del servicio en el servidor y se crea
 * el crédito abonable a la reparación; el cliente no puede enviar ni el monto ni el crédito.
 */
export async function recordDiagnosisPaymentAction(fd: FormData): Promise<void> {
  const actor = await assertRole(["superadmin"]);
  const p = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const { error } = await createAdminClient().rpc("record_diagnosis_payment", { p_actor: actor.id, p_ticket: p.data.ticketId, p_method: p.data.method });
  if (error) console.error("diagnosis.payment", error.code, error.message);
  revalidatePath(`/b/tickets/${p.data.ticketId}`);
}

const quoteSchema = z.object({ quoteId: z.string().uuid(), ticketId: z.string().uuid(), method: z.enum(["cash", "bank_transfer", "other"]) });

/** Pago manual de una cotización aprobada (solo SUPERADMIN, con MFA). El importe sale de la cotización congelada en la BD. */
export async function recordQuotePaymentAction(fd: FormData): Promise<void> {
  const actor = await assertRole(["superadmin"]);
  const p = quoteSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const { error } = await createAdminClient().rpc("record_manual_service_payment", { p_actor: actor.id, p_kind: "quote", p_ref: p.data.quoteId, p_method: p.data.method });
  if (error) console.error("quote.payment", error.code, error.message);
  revalidatePath(`/b/tickets/${p.data.ticketId}`);
}
