"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { allow, TOO_MANY } from "@/lib/auth/rate-limit";
import { type ActionState } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  ticketId: z.string().uuid(),
  quoteId: z.string().uuid(),
  decision: z.enum(["approve", "reject", "question"]),
  message: z.string().trim().max(1000).optional(),
});

const ERRORS: [RegExp, string][] = [
  [/quote_expired/, "Esta cotización venció. Pide una nueva a nuestro equipo."],
  [/quote_not_open|quote_not_found/, "Esta cotización ya no está disponible para decidir."],
  [/message_required/, "Escribe tu pregunta."],
];

/**
 * La decisión se valida por completo en la base de datos: dueño de la cotización, estado, vigencia y flujo del ticket.
 * El cliente solo envía "qué decide"; nunca el estado, el total ni el ticket destino.
 */
export async function decideQuoteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const profile = await assertRole(["client"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: "Datos no válidos." };
  const v = parsed.data;
  if (!(await allow("quote-decide", profile.id, 20, 3600))) return { ok: false, error: TOO_MANY };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_quote", { p_quote: v.quoteId, p_decision: v.decision, p_message: v.message || null });
  if (error) return { ok: false, error: ERRORS.find(([re]) => re.test(error.message))?.[1] ?? "No pudimos registrar tu decisión. Inténtalo de nuevo." };
  revalidatePath(`/c/tickets/${v.ticketId}`);
  return {
    ok: true,
    message: v.decision === "approve" ? "¡Gracias! Registramos tu aprobación." : v.decision === "reject" ? "Registramos que rechazaste la cotización." : "Enviamos tu pregunta al técnico.",
  };
}
