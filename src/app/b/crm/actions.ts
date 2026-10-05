"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  taskId: z.string().uuid(),
  channel: z.enum(["whatsapp", "call", "email", "visit", "app"]),
  result: z.enum(["pending", "contacted", "interested", "scheduled", "done", "no_answer", "not_interested"]),
  note: z.string().trim().max(1000).optional(),
  nextAction: z.string().trim().max(300).optional(),
  nextActionAt: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
});

/** Registra el contacto (inmutable) y mueve la tarea al estado resultante. Solo quien gestiona CRM (RLS + permiso). */
export async function logInteractionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const profile = await assertRole(["technician", "superadmin"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("crm_interactions").insert({
    task_id: v.taskId,
    channel: v.channel,
    result: v.result,
    note: v.note || null,
    next_action: v.nextAction || null,
    next_action_at: v.nextActionAt ? `${v.nextActionAt}T09:00:00-05:00` : null,
  });
  if (error) return { ok: false, error: "No pudimos registrar el contacto." };
  if (profile.role === "superadmin") {
    await supabase.from("crm_tasks").update({ status: v.result, ...(v.nextActionAt ? { due_at: `${v.nextActionAt}T09:00:00-05:00` } : {}) }).eq("id", v.taskId);
  }
  revalidatePath("/b/crm");
  return { ok: true, message: "Contacto registrado." };
}
