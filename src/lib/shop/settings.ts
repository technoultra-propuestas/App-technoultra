import { createPublicClient } from "@/lib/supabase/public";
import { PRODUCT_SHIPPING_CALI_OUTSIDE, PRODUCT_SHIPPING_CALI_URBAN } from "@/lib/catalog/config";

/** Ajustes y banner del SHOP que ve el público (RLS: solo lo vigente). Si la base no responde, valores seguros por defecto: nunca se rompe la tienda. */
export type ShopSettings = {
  title: string;
  subtitle: string | null;
  show_featured: boolean;
  shipping_enabled: boolean;
  shipping_title: string;
  shipping_urban_fee: number;
  shipping_outside_fee: number;
  shipping_note: string;
  whatsapp_intro: string;
  whatsapp_closing: string;
};
export type ShopBanner = { id: string; title: string; subtitle: string | null; image_url: string | null; cta_label: string | null; cta_href: string | null; tone: "dark" | "brand" | "light" };

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  title: "SHOP",
  subtitle: "Tecnología con garantía de TechnoUltra",
  show_featured: true,
  shipping_enabled: true,
  shipping_title: "Envíos TechnoUltra",
  shipping_urban_fee: PRODUCT_SHIPPING_CALI_URBAN,
  shipping_outside_fee: PRODUCT_SHIPPING_CALI_OUTSIDE,
  shipping_note: "Valor sujeto a validación de dirección.",
  whatsapp_intro: "Quiero consultar la compra de los siguientes productos:",
  whatsapp_closing: "¿Me pueden confirmar disponibilidad y coordinar la entrega?",
};

export async function loadShopSettings(): Promise<ShopSettings> {
  try {
    const { data } = await createPublicClient().from("shop_settings").select("title, subtitle, show_featured, shipping_enabled, shipping_title, shipping_urban_fee, shipping_outside_fee, shipping_note, whatsapp_intro, whatsapp_closing").maybeSingle();
    return data ? { ...DEFAULT_SHOP_SETTINGS, ...data } : DEFAULT_SHOP_SETTINGS;
  } catch {
    return DEFAULT_SHOP_SETTINGS;
  }
}

/** Banner vigente de mayor prioridad (la política RLS ya filtra activo + fechas). Sin banner activo no se muestra nada. */
export async function loadActiveBanner(): Promise<ShopBanner | null> {
  try {
    const { data } = await createPublicClient().from("shop_banners").select("id, title, subtitle, image_url, cta_label, cta_href, tone").order("priority", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data ? ({ ...data, tone: data.tone as ShopBanner["tone"] }) : null;
  } catch {
    return null;
  }
}
