"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { LEGAL_SLUGS } from "@/lib/domain/legal";
import { createClient } from "@/lib/supabase/server";

const draftSchema = z.object({
  slug: z.enum(LEGAL_SLUGS.map((s) => s.slug) as [string, ...string[]]),
  title: z.string().trim().min(3, "Escribe el título.").max(160),
  content: z.string().trim().min(20, "El contenido es demasiado corto.").max(200_000),
  requiresAcceptance: z.string().optional(),
});

export async function createLegalDraftAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["superadmin"]);
  const parsed = draftSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { data: next, error: e1 } = await supabase.rpc("next_legal_version", { p_slug: v.slug });
  if (e1 || !next) return { ok: false, error: "No tienes permiso para gestionar documentos legales." };
  const { error } = await supabase.from("legal_documents").insert({ slug: v.slug, version: next, title: v.title, content: v.content, requires_acceptance: v.requiresAcceptance === "on", status: "draft" });
  if (error) return { ok: false, error: "No pudimos guardar el borrador." };
  revalidatePath("/b/legal");
  return { ok: true, message: `Borrador de la versión ${next} creado. Revísalo con un abogado antes de publicarlo.` };
}

const idSchema = z.object({ id: z.string().uuid() });
export async function publishLegalAction(fd: FormData): Promise<void> {
  await assertRole(["superadmin"]);
  const p = idSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  await (await createClient()).rpc("publish_legal_document", { p_id: p.data.id });
  revalidatePath("/b/legal");
}
export async function deleteLegalDraftAction(fd: FormData): Promise<void> {
  await assertRole(["superadmin"]);
  const p = idSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  await (await createClient()).from("legal_documents").delete().eq("id", p.data.id).eq("status", "draft");
  revalidatePath("/b/legal");
}
