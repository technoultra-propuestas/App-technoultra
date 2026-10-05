"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { ACCESSORIES, DAMAGES } from "@/lib/domain/reception";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  ticketId: z.string().uuid(),
  reason: z.string().trim().min(3, "Escribe el motivo de ingreso.").max(1000),
  physicalCondition: z.string().trim().max(500).optional(),
  observations: z.string().trim().max(1000).optional(),
});

/** Los accesorios y daños salen de listas cerradas (se descarta cualquier valor que no esté en ellas). */
const pick = (fd: FormData, key: string, allowed: string[]) => fd.getAll(key).map(String).filter((v) => allowed.includes(v));

export async function saveReceptionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["technician", "superadmin"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const row = {
    accessories: pick(fd, "accessories", ACCESSORIES),
    visible_damage: pick(fd, "damage", DAMAGES),
    physical_condition: v.physicalCondition || null,
    reason: v.reason,
    observations: v.observations || null,
  };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("receptions").select("id").eq("ticket_id", v.ticketId).maybeSingle();
  const { error } = existing
    ? await supabase.from("receptions").update(row).eq("id", existing.id)
    : await supabase.from("receptions").insert({ ticket_id: v.ticketId, ...row });
  if (error) return { ok: false, error: "No pudimos guardar la recepción. Verifica que el ticket sea tuyo y siga abierto." };
  revalidatePath(`/b/tickets/${v.ticketId}`);
  return { ok: true, message: "Recepción guardada." };
}
