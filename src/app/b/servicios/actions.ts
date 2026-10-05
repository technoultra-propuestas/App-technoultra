"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { formToObject, serviceSchema, toServiceRow } from "@/lib/domain/service";
import { createClient } from "@/lib/supabase/server";

const friendly = (code?: string) =>
  code === "23505" ? "Ya existe un servicio con ese nombre/slug." : code === "42501" ? "No tienes permiso para esta acción." : "No pudimos guardar el servicio.";

export async function createServiceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["admin"]);
  const parsed = serviceSchema.safeParse(formToObject(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").insert(toServiceRow(parsed.data)).select("id").single();
  if (error || !data) return { ok: false, error: friendly(error?.code) };
  revalidatePath("/b/servicios");
  redirect(`/b/servicios/${data.id}`);
}

export async function updateServiceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["admin"]);
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Servicio no válido." };
  const parsed = serviceSchema.safeParse(formToObject(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").update(toServiceRow(parsed.data)).eq("id", id.data).select("id");
  if (error || !data?.length) return { ok: false, error: friendly(error?.code) };
  revalidatePath("/b/servicios");
  return { ok: true, message: "Cambios guardados." };
}

const catSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre.").max(80),
  kind: z.enum(["technical", "digital"]),
});
export async function createCategoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["admin"]);
  const parsed = catSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const { slugify } = await import("@/lib/domain/service");
  const supabase = await createClient();
  const { error } = await supabase.from("service_categories").insert({ name: parsed.data.name, kind: parsed.data.kind, slug: slugify(parsed.data.name) });
  if (error) return { ok: false, error: error.code === "23505" ? "Esa categoría ya existe." : "No pudimos guardar la categoría." };
  revalidatePath("/b/servicios");
  return { ok: true, message: "Categoría creada." };
}

/** Elimina de forma segura: si el servicio tiene historial el servidor lo archiva (borrado lógico) en lugar de borrarlo. */
export async function deleteServiceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["admin"]);
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Servicio no válido." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_service", { p_id: id.data });
  if (error) return { ok: false, error: error.code === "42501" ? "No tienes permiso para esta acción." : "No pudimos eliminar el servicio." };
  revalidatePath("/b/servicios");
  redirect(`/b/servicios?resultado=${data === "archived" ? "archivado" : "eliminado"}`);
}

const subSchema = z.object({
  categoryId: z.string().uuid("Elige la categoría."),
  name: z.string().trim().min(2, "Escribe el nombre.").max(80),
});
export async function createSubcategoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["admin"]);
  const parsed = subSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const { slugify } = await import("@/lib/domain/service");
  const supabase = await createClient();
  const { error } = await supabase.from("service_subcategories").insert({ category_id: parsed.data.categoryId, name: parsed.data.name, slug: slugify(parsed.data.name) });
  if (error) return { ok: false, error: error.code === "23505" ? "Esa subcategoría ya existe en la categoría." : "No pudimos guardar la subcategoría." };
  revalidatePath("/b/servicios");
  return { ok: true, message: "Subcategoría creada." };
}

/** Activa/desactiva una categoría o subcategoría (visibilidad en el catálogo). */
export async function toggleCatalogNodeAction(fd: FormData): Promise<void> {
  await assertRole(["admin"]);
  const parsed = z.object({ table: z.enum(["service_categories", "service_subcategories"]), id: z.string().uuid(), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.from(parsed.data.table).update({ is_active: parsed.data.active === "true" }).eq("id", parsed.data.id);
  revalidatePath("/b/servicios");
}

/** Elimina una categoría/subcategoría solo si no tiene servicios (lo valida la base de datos). */
export async function deleteCatalogNodeAction(fd: FormData): Promise<void> {
  await assertRole(["admin"]);
  const parsed = z.object({ kind: z.enum(["category", "subcategory"]), id: z.string().uuid() }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.rpc(parsed.data.kind === "category" ? "delete_service_category" : "delete_service_subcategory", { p_id: parsed.data.id });
  revalidatePath("/b/servicios");
}
