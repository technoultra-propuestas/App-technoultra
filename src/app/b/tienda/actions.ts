"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { slugify } from "@/lib/domain/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const text = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const productSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre.").max(160),
  sku: z.string().trim().min(2, "Escribe el SKU.").max(40),
  slug: z.string().trim().max(80).optional(),
  categoryId: z.union([z.literal(""), z.string().uuid()]).optional(),
  brand: text(60),
  description: text(4000),
  price: z.string().transform((v) => Number(v.replace(/[^0-9.]/g, ""))).pipe(z.number().min(0, "Precio no válido.").max(1_000_000_000)),
  warrantyDays: z.string().optional().transform((v) => (v ? Number(v) : 0)).pipe(z.number().int().min(0).max(3650)),
  isActive: z.string().optional().transform((v) => v === "on"),
});
const friendly = (code?: string) => (code === "23505" ? "Ya existe un producto con ese SKU o slug." : code === "42501" ? "No tienes permiso." : "No pudimos guardar el producto.");

const row = (v: z.infer<typeof productSchema>) => ({
  name: v.name,
  sku: v.sku.toUpperCase(),
  slug: slugify(v.slug || v.name),
  category_id: v.categoryId || null,
  brand: v.brand,
  description: v.description,
  price: v.price,
  warranty_days: v.warrantyDays,
  is_active: v.isActive,
});

export async function createProductAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["superadmin"]);
  const parsed = productSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const { data, error } = await (await createClient()).from("products").insert(row(parsed.data)).select("id").single();
  if (error || !data) return { ok: false, error: friendly(error?.code) };
  revalidatePath("/b/tienda");
  redirect(`/b/tienda/${data.id}`);
}

export async function updateProductAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["superadmin"]);
  const id = z.string().uuid().safeParse(fd.get("id"));
  const parsed = productSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!id.success) return { ok: false, error: "Producto no válido." };
  if (!parsed.success) return zodToState(parsed.error);
  const { data, error } = await (await createClient()).from("products").update(row(parsed.data)).eq("id", id.data).select("id");
  if (error || !data?.length) return { ok: false, error: friendly(error?.code) };
  revalidatePath(`/b/tienda/${id.data}`);
  return { ok: true, message: "Cambios guardados." };
}

const sourceEditSchema = z.object({
  id: z.string().uuid(),
  warrantyDays: z.string().optional().transform((v) => (v ? Number(v) : 0)).pipe(z.number().int().min(0).max(3650)),
  isActive: z.string().optional().transform((v) => v === "on"),
});
/** Producto de proveedor: solo se editan garantía y visibilidad (lo demás lo manda la fuente; la base de datos lo impide además). */
export async function updateSourceProductAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["superadmin"]);
  const parsed = sourceEditSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const { data, error } = await (await createClient()).from("products").update({ warranty_days: parsed.data.warrantyDays, is_active: parsed.data.isActive }).eq("id", parsed.data.id).not("source", "is", null).select("id");
  if (error || !data?.length) return { ok: false, error: friendly(error?.code) };
  revalidatePath(`/b/tienda/${parsed.data.id}`);
  revalidatePath("/tienda");
  return { ok: true, message: "Cambios guardados." };
}

const stockSchema = z.object({
  productId: z.string().uuid(),
  delta: z.string().transform((v) => Number(v)).pipe(z.number().int("Usa un número entero.").refine((n) => n !== 0, "No puede ser 0.").refine((n) => Math.abs(n) <= 100000)),
  reason: z.enum(["purchase", "adjustment", "return", "install_use"]),
  note: text(300),
});
/** El stock solo cambia con movimientos (libro mayor inmutable); la base de datos impide saldos negativos. */
export async function adjustStockAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["superadmin"]);
  const parsed = stockSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const { error } = await (await createClient()).from("inventory_movements").insert({ product_id: v.productId, delta: v.delta, reason: v.reason, note: v.note });
  if (error) return { ok: false, error: /insufficient_stock/.test(error.message) ? "El stock no puede quedar negativo." : "No pudimos registrar el movimiento." };
  revalidatePath(`/b/tienda/${v.productId}`);
  return { ok: true, message: "Movimiento registrado." };
}

const linkSchema = z.object({ productId: z.string().uuid(), serviceId: z.string().uuid() });
export async function linkInstallationAction(fd: FormData): Promise<void> {
  await assertRole(["superadmin"]);
  const p = linkSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  await (await createClient()).from("product_service_links").insert({ product_id: p.data.productId, service_id: p.data.serviceId, link_kind: "installation" });
  revalidatePath(`/b/tienda/${p.data.productId}`);
}
export async function unlinkInstallationAction(fd: FormData): Promise<void> {
  await assertRole(["superadmin"]);
  const p = linkSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  await (await createClient()).from("product_service_links").delete().eq("product_id", p.data.productId).eq("service_id", p.data.serviceId);
  revalidatePath(`/b/tienda/${p.data.productId}`);
}

const catSchema = z.object({ name: z.string().trim().min(2, "Escribe el nombre.").max(80) });
export async function createProductCategoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["superadmin"]);
  const parsed = catSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const { error } = await (await createClient()).from("product_categories").insert({ name: parsed.data.name, slug: slugify(parsed.data.name) });
  if (error) return { ok: false, error: error.code === "23505" ? "Esa categoría ya existe." : "No pudimos guardar la categoría." };
  revalidatePath("/b/tienda");
  return { ok: true, message: "Categoría creada." };
}

// ---------------------------------------------------------------- pedidos
const orderStatus = z.object({ orderId: z.string().uuid(), status: z.enum(["preparing", "shipped", "delivered", "cancelled"]) });
export async function setOrderStatusAction(fd: FormData): Promise<void> {
  await assertRole(["superadmin"]);
  const p = orderStatus.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const supabase = await createClient();
  // La cancelación pasa por la función que devuelve el stock; el resto avanza el flujo logístico (la BD exige pago previo).
  if (p.data.status === "cancelled") await supabase.rpc("cancel_order", { p_order: p.data.orderId });
  else await supabase.from("orders").update({ status: p.data.status }).eq("id", p.data.orderId);
  revalidatePath("/b/pedidos");
}

const manual = z.object({ orderId: z.string().uuid(), method: z.enum(["cash", "bank_transfer", "cash_on_delivery", "other"]) });
/** Pago manual: solo administración, con verificación del actor en base de datos y registro de auditoría. */
export async function manualPaymentAction(fd: FormData): Promise<void> {
  const actor = await assertRole(["superadmin"]);
  const p = manual.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  await createAdminClient().rpc("record_manual_payment", { p_actor: actor.id, p_order: p.data.orderId, p_method: p.data.method });
  revalidatePath("/b/pedidos");
}
