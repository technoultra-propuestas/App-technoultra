import { WHATSAPP_NUMBER } from "./config";
import { copFormat } from "./normalize";

export type InquiryProduct = { name: string; ref: string | null; price: number; brand?: string | null; category?: string | null; subcategory?: string | null };

/** Textos configurables desde el SUPERADMIN (shop_settings). Los valores por defecto son los de la migración. */
export type WhatsappCopy = { intro?: string; closing?: string };
const DEFAULT_INTRO = "Quiero consultar la compra de los siguientes productos:";
const DEFAULT_CLOSING = "¿Me pueden confirmar disponibilidad y coordinar la entrega?";

/**
 * Mensaje de UN producto (ficha). El precio publicado YA es el precio comercial de TechnoUltra: no se pregunta «precio actual».
 * No lleva datos personales ni dirección (eso se conversa en WhatsApp).
 */
export function buildWhatsappMessage(p: InquiryProduct, copy: WhatsappCopy = {}): string {
  const lines = ["Hola TechnoUltra 👋", "", "Quiero consultar la compra de:", "", `Producto: ${p.name}`];
  if (p.ref) lines.push(`Referencia: ${p.ref}`);
  if (p.brand) lines.push(`Marca: ${p.brand}`);
  if (p.category) lines.push(`Categoría: ${[p.category, p.subcategory].filter(Boolean).join(" › ")}`);
  lines.push(`Precio publicado: ${copFormat(p.price)}`, "", copy.closing?.trim() || DEFAULT_CLOSING);
  return lines.join("\n");
}

export type CartMessageLine = { name: string; ref: string | null; price: number; qty: number };

/** Un solo mensaje con todos los productos del carrito (precio publicado, referencia y cantidad), subtotal y entrega por confirmar. */
export function buildCartMessage(lines: CartMessageLine[], copy: WhatsappCopy = {}): string {
  const out = ["Hola TechnoUltra 👋", "", copy.intro?.trim() || DEFAULT_INTRO, ""];
  let subtotal = 0;
  lines.forEach((l, i) => {
    subtotal += l.price * l.qty;
    out.push(`${i + 1}. ${l.name}`);
    if (l.ref) out.push(`Referencia: ${l.ref}`);
    out.push(`Precio publicado: ${copFormat(l.price)}`, `Cantidad: ${l.qty}`, "");
  });
  out.push(`Subtotal productos: ${copFormat(subtotal)}`, "", "Entrega:", "Pendiente de confirmar", "", copy.closing?.trim() || DEFAULT_CLOSING);
  return out.join("\n");
}

/** Enlace wa.me con el texto codificado (acentos, emojis y saltos de línea intactos). */
export const whatsappUrl = (message: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
export const productWhatsappUrl = (p: InquiryProduct, copy?: WhatsappCopy) => whatsappUrl(buildWhatsappMessage(p, copy));
export const cartWhatsappUrl = (lines: CartMessageLine[], copy?: WhatsappCopy) => whatsappUrl(buildCartMessage(lines, copy));
