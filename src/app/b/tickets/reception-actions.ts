"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { advanceAfterReception } from "@/lib/tickets/auto";
import { generateTicketDocument } from "@/lib/documents/generate";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { ACCESSORIES, DAMAGES, receptionPhotoStatus } from "@/lib/domain/reception";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  ticketId: z.string().uuid(),
  reason: z.string().trim().min(3, "Escribe el motivo de ingreso.").max(1000),
  observations: z.string().trim().max(1000).optional(),
});

/** Los accesorios y daños salen de listas cerradas (se descarta cualquier valor que no esté en ellas). */
const pick = (fd: FormData, key: string, allowed: string[]) => fd.getAll(key).map(String).filter((v) => allowed.includes(v));

/**
 * «Confirmar recepción»: registra el acta del equipo (daños, accesorios, motivo y detalles). Las fotografías se suben ANTES, directo al
 * ticket (la evidencia pertenece al ticket, no a la recepción), así que no hace falta guardar nada para empezar y nada queda huérfano.
 * Crear el acta exige las cuatro vistas obligatorias; editarla después no. El campo histórico «Estado físico» no se toca: lo que se
 * escribe ahora en «Otros daños, detalles o condiciones» se guarda en `observations`.
 */
export async function saveReceptionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole(["technician", "superadmin"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const damage = pick(fd, "damage", DAMAGES);
  if (damage.includes("Otros daños") && (v.observations ?? "").length < 3) {
    return { ok: false, error: "Describe los otros daños en el campo de detalles.", fieldErrors: { observations: "Describe los otros daños." } };
  }
  const supabase = await createClient();
  const { data: existing } = await supabase.from("receptions").select("id, reason, accessories, visible_damage, observations").eq("ticket_id", v.ticketId).maybeSingle();
  if (!existing) {
    const { data: ev } = await supabase.from("evidence").select("slot").eq("ticket_id", v.ticketId).eq("stage", "reception").is("deleted_at", null);
    const st = receptionPhotoStatus((ev ?? []).map((e) => e.slot));
    if (!st.complete) {
      const n = st.total - st.done;
      return { ok: false, error: `Faltan ${n} foto${n === 1 ? "" : "s"} obligatoria${n === 1 ? "" : "s"}: ${st.missingLabels.join(", ")}.` };
    }
  }
  const row = {
    accessories: pick(fd, "accessories", ACCESSORIES),
    visible_damage: damage,
    reason: v.reason,
    observations: v.observations || null,
  };
  const { error } = existing
    ? await supabase.from("receptions").update(row).eq("id", existing.id)
    : await supabase.from("receptions").insert({ ticket_id: v.ticketId, ...row });
  if (error) return { ok: false, error: "No pudimos guardar la recepción. Verifica que el ticket sea tuyo y siga abierto." };
  // El acta se genera AL CONFIRMAR la recepción (queda «pendiente de firma»). Si se edita una recepción ya confirmada y cambió algo, se emite una
  // versión nueva que exige nueva firma; la versión firmada anterior se conserva intacta.
  const changed = !existing || JSON.stringify([existing.reason, existing.accessories, existing.visible_damage, existing.observations ?? null]) !== JSON.stringify([row.reason, row.accessories, row.visible_damage, row.observations]);
  let acta: { ok: boolean } = { ok: true };
  if (changed) acta = await generateTicketDocument("reception", v.ticketId, actor.id).catch(() => ({ ok: false as const, error: "error" }));
  if (changed && !acta.ok) console.error("reception.acta", v.ticketId);
  const advanced = await advanceAfterReception(v.ticketId, actor.id);
  revalidatePath(`/b/tickets/${v.ticketId}`);
  revalidatePath("/b/tickets");
  const base = existing ? "Recepción actualizada." : "Recepción confirmada.";
  const next = !acta.ok ? " No pudimos generar el acta: usa «Generar acta» para reintentar." : advanced ? " El ticket pasó a «En diagnóstico»." : changed ? " El acta quedó lista para que el cliente la firme." : "";
  return { ok: true, message: base + next };
}
