"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional();
const schema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(3, "Escribe el título.").max(160),
  scope: z.string().trim().max(4000).optional(),
  status: z.enum(["lead", "scoped", "in_progress", "review", "delivered", "paused", "cancelled"]),
  progress: z.string().transform(Number).pipe(z.number().int().min(0).max(100)),
  ownerId: z.union([z.literal(""), z.string().uuid()]).optional(),
  startsOn: date,
  dueOn: date,
  clientNotes: z.string().trim().max(2000).optional(),
});

export async function updateProjectAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["superadmin"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  if (v.startsOn && v.dueOn && v.dueOn < v.startsOn) return { ok: false, error: "La fecha de entrega no puede ser anterior al inicio." };
  const { data, error } = await (await createClient())
    .from("digital_projects")
    .update({ title: v.title, scope: v.scope || null, status: v.status, progress: v.progress, owner_id: v.ownerId || null, starts_on: v.startsOn || null, due_on: v.dueOn || null, client_notes: v.clientNotes || null })
    .eq("id", v.id)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "No pudimos guardar el proyecto." };
  revalidatePath(`/b/proyectos/${v.id}`);
  revalidatePath("/b/proyectos");
  return { ok: true, message: "Proyecto actualizado." };
}

const commentSchema = z.object({ projectId: z.string().uuid(), body: z.string().trim().min(1, "Escribe el comentario.").max(2000), visibility: z.enum(["client", "internal"]) });
export async function addProjectCommentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["superadmin"]);
  const parsed = commentSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const { error } = await (await createClient()).from("project_comments").insert({ project_id: parsed.data.projectId, body: parsed.data.body, visibility: parsed.data.visibility });
  if (error) return { ok: false, error: "No pudimos guardar el comentario." };
  revalidatePath(`/b/proyectos/${parsed.data.projectId}`);
  return { ok: true, message: "Comentario guardado." };
}
