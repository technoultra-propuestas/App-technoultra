"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { assertRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Administración del SHOP (solo SUPERADMIN con MFA; la base de datos vuelve a exigir el permiso catalog.manage por RLS). */

const text = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const bool = z.string().optional().transform((v) => v === "on");
const int = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => Number(v.replace(/[^0-9]/g, "")))
    .pipe(z.number().int().min(min).max(max));
const refresh = () => {
  revalidatePath("/b/tienda/shop");
  revalidatePath("/tienda");
  revalidatePath("/tienda/carrito");
};

const settingsSchema = z.object({
  title: z.string().trim().min(2, "Escribe el título.").max(40),
  subtitle: text(160),
  showFeatured: bool,
  shippingEnabled: bool,
  shippingTitle: z.string().trim().min(2, "Escribe el título del aviso de envíos.").max(60),
  shippingUrbanFee: int(0, 200000),
  shippingOutsideFee: int(0, 200000),
  shippingNote: z.string().trim().max(160),
  whatsappIntro: z.string().trim().min(3, "Escribe la introducción del mensaje.").max(200),
  whatsappClosing: z.string().trim().min(3, "Escribe el cierre del mensaje.").max(200),
});

export async function saveShopSettingsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const me = await assertRole(["superadmin"]);
  const parsed = settingsSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const { data, error } = await (await createClient())
    .from("shop_settings")
    .update({
      title: v.title,
      subtitle: v.subtitle,
      show_featured: v.showFeatured,
      shipping_enabled: v.shippingEnabled,
      shipping_title: v.shippingTitle,
      shipping_urban_fee: v.shippingUrbanFee,
      shipping_outside_fee: v.shippingOutsideFee,
      shipping_note: v.shippingNote,
      whatsapp_intro: v.whatsappIntro,
      whatsapp_closing: v.whatsappClosing,
      updated_by: me.id,
    })
    .eq("id", true)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "No pudimos guardar los ajustes del Shop." };
  refresh();
  return { ok: true, message: "Ajustes del Shop guardados." };
}

const localDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(`${v}:00-05:00`).toISOString() : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Fecha no válida.");

const bannerSchema = z.object({
  id: z.union([z.literal(""), z.string().uuid()]).optional(),
  title: z.string().trim().min(2, "Escribe el título.").max(80),
  subtitle: text(160),
  imageUrl: z.string().trim().max(500).optional().transform((v) => (v ? v : null)).refine((v) => v === null || /^https:\/\/[^\s]+$/.test(v), "La imagen debe ser un enlace https."),
  ctaLabel: text(30),
  ctaHref: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^(\/[A-Za-z0-9/_?=&%.#-]*|https:\/\/[^\s]+)$/.test(v), "El enlace debe ser una ruta de la app (/tienda…) o una dirección https."),
  tone: z.enum(["dark", "brand", "light"]),
  isActive: bool,
  priority: int(0, 999),
  startsAt: localDate,
  endsAt: localDate,
});

export async function saveBannerAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const me = await assertRole(["superadmin"]);
  const parsed = bannerSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) return { ok: false, error: "La fecha de fin debe ser posterior a la de inicio." };
  if ((v.ctaLabel && !v.ctaHref) || (!v.ctaLabel && v.ctaHref)) return { ok: false, error: "El botón necesita texto y enlace (o deja ambos vacíos)." };
  const row = { title: v.title, subtitle: v.subtitle, image_url: v.imageUrl, cta_label: v.ctaLabel, cta_href: v.ctaHref, tone: v.tone, is_active: v.isActive, priority: v.priority, starts_at: v.startsAt, ends_at: v.endsAt };
  const supabase = await createClient();
  const res = v.id ? await supabase.from("shop_banners").update(row).eq("id", v.id).select("id") : await supabase.from("shop_banners").insert({ ...row, created_by: me.id }).select("id");
  if (res.error || !res.data?.length) return { ok: false, error: "No pudimos guardar el banner." };
  refresh();
  return { ok: true, message: v.id ? "Banner actualizado." : "Banner creado." };
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteBannerAction(fd: FormData): Promise<void> {
  await assertRole(["superadmin"]);
  const p = idSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  await (await createClient()).from("shop_banners").delete().eq("id", p.data.id);
  refresh();
}

export async function toggleBannerAction(fd: FormData): Promise<void> {
  await assertRole(["superadmin"]);
  const p = z.object({ id: z.string().uuid(), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  await (await createClient()).from("shop_banners").update({ is_active: p.data.active === "true" }).eq("id", p.data.id);
  refresh();
}

const categorySchema = z.object({ id: z.string().uuid(), sortOrder: int(0, 9999), isFeatured: bool, isActive: bool });

/** Orden, visibilidad y «destacada» de una categoría del Shop. La estructura (nombres, relación con subcategorías) viene del catálogo y no se edita aquí. */
export async function saveShopCategoryAction(fd: FormData): Promise<void> {
  await assertRole(["superadmin"]);
  const p = categorySchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  await (await createClient()).from("product_categories").update({ sort_order: p.data.sortOrder, is_featured: p.data.isFeatured, is_active: p.data.isActive }).eq("id", p.data.id);
  refresh();
}
