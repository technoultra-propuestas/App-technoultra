"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auditAdmin } from "@/lib/auth/audit";
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
  const { error } = await supabase.from("legal_documents").insert({ slug: v.slug, version: next, title: v.title, content: v.content, requires_acceptance: v.requiresAcceptance === "on", status: "draft", content_sha256: "" /* el trigger de la BD calcula el hash real */ });
  if (error) return { ok: false, error: "No pudimos guardar el borrador." };
  revalidatePath("/b/legal");
  return { ok: true, message: `Borrador de la versión ${next} creado. Revísalo con un abogado antes de publicarlo.` };
}

const idSchema = z.object({ id: z.string().uuid() });

/** Publica un borrador. La base de datos lo rechaza mientras existan campos «[PENDIENTE: …]». */
export async function publishLegalAction(fd: FormData): Promise<void> {
  const actor = await assertRole(["superadmin"]);
  const p = idSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const { error } = await (await createClient()).rpc("publish_legal_document", { p_id: p.data.id });
  if (error) {
    console.error("legal.publish", error.code, error.message);
    redirect(`/b/legal?error=${error.message.includes("legal_placeholders_pending") ? "pendientes" : "publicar"}`);
  }
  await auditAdmin(actor.id, "superadmin.settings_changed", undefined, { setting: "legal_published" });
  revalidatePath("/b/legal");
  revalidatePath("/legal", "layout");
  redirect("/b/legal?ok=publicado");
}

export async function deleteLegalDraftAction(fd: FormData): Promise<void> {
  await assertRole(["superadmin"]);
  const p = idSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  await (await createClient()).from("legal_documents").delete().eq("id", p.data.id).eq("status", "draft");
  revalidatePath("/b/legal");
}

const fillSchema = z.object({
  nit: z.union([z.literal(""), z.string().trim().regex(/^[0-9A-Za-z.\- ]{5,25}$/, "Escribe la cédula o NIT (solo números, puntos y guion).")]).optional(),
  city: z.union([z.literal(""), z.string().trim().min(2, "Escribe la ciudad.").max(60)]).optional(),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Escribe un correo válido.").max(254)]).optional(),
});
const MARKERS = { nit: "[PENDIENTE: CC/NIT]", city: "[PENDIENTE: ciudad]", email: "[PENDIENTE: correo jurídico]" } as const;

/** Completa de una vez los campos pendientes en TODOS los borradores. Solo SUPERADMIN; no toca versiones publicadas (inmutables). */
export async function fillLegalPlaceholdersAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole(["superadmin"]);
  const parsed = fillSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const values = parsed.data;
  if (!values.nit && !values.city && !values.email) return { ok: false, error: "Completa al menos un dato." };
  const supabase = await createClient();
  const { data: drafts, error } = await supabase.from("legal_documents").select("id, content").eq("status", "draft");
  if (error) return { ok: false, error: "No pudimos leer los borradores." };
  let changed = 0;
  for (const d of drafts ?? []) {
    let content = d.content as string;
    for (const k of ["nit", "city", "email"] as const) if (values[k]) content = content.split(MARKERS[k]).join(values[k]!);
    if (content === d.content) continue;
    const { error: e } = await supabase.from("legal_documents").update({ content }).eq("id", d.id).eq("status", "draft");
    if (e) {
      console.error("legal.fill", e.code, e.message);
      return { ok: false, error: "No pudimos actualizar un borrador. Inténtalo de nuevo." };
    }
    changed++;
  }
  await auditAdmin(actor.id, "superadmin.settings_changed", undefined, { setting: "legal_placeholders" });
  revalidatePath("/b/legal");
  return { ok: true, message: changed ? `Datos aplicados en ${changed} borrador(es).` : "No había campos pendientes con esos datos." };
}

const editSchema = z.object({ id: z.string().uuid(), title: z.string().trim().min(3).max(160), content: z.string().trim().min(20, "El contenido es demasiado corto.").max(200_000) });
/** Edita título y contenido de un BORRADOR (los publicados son inmutables en la base de datos). */
export async function updateLegalDraftAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["superadmin"]);
  const parsed = editSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const { id, title, content } = parsed.data;
  const { data, error } = await (await createClient()).from("legal_documents").update({ title, content }).eq("id", id).eq("status", "draft").select("id");
  if (error || !data?.length) {
    if (error) console.error("legal.update", error.code, error.message);
    return { ok: false, error: "No pudimos guardar los cambios (¿el documento ya está publicado?)." };
  }
  revalidatePath("/b/legal");
  revalidatePath(`/b/legal/${id}`);
  return { ok: true, message: "Cambios guardados." };
}
