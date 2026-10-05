"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  type: z.enum(["reception", "diagnosis", "delivery", "maintenance", "warranty", "crm", "visit"]),
  title: z.string().trim().min(2, "Escribe el título.").max(160),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige la fecha."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Elige la hora."),
  duration: z.string().transform(Number).pipe(z.number().int().min(5).max(1440)),
  assignedTo: z.union([z.literal(""), z.string().uuid()]).optional(),
});

/** Eventos manuales de agenda (los de recogida, entrega y mantenimiento los crea el flujo). Solo CRM/administración. */
export async function createEventAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["superadmin"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const { error } = await (await createClient()).from("calendar_events").insert({
    event_type: v.type,
    title: v.title,
    starts_at: `${v.day}T${v.time}:00-05:00`,
    duration_minutes: v.duration,
    assigned_to: v.assignedTo || null,
  });
  if (error) return { ok: false, error: "No pudimos crear el evento." };
  revalidatePath("/b/agenda");
  return { ok: true, message: "Evento creado." };
}
