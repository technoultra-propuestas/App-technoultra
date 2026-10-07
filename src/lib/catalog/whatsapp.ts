import { WHATSAPP_NUMBER } from "./config";
import { copFormat } from "./normalize";

export type InquiryProduct = { name: string; ref: string | null; price: number; brand?: string | null; category?: string | null; subcategory?: string | null };

/** Mensaje prellenado para consultar un producto por WhatsApp. No lleva datos personales ni dirección (eso se pregunta en la conversación). */
export function buildWhatsappMessage(p: InquiryProduct): string {
  const lines = ["Hola TechnoUltra 👋", "", "Quiero consultar la compra de:", "", `Producto: ${p.name}`];
  if (p.ref) lines.push(`Referencia: ${p.ref}`);
  if (p.brand) lines.push(`Marca: ${p.brand}`);
  if (p.category) lines.push(`Categoría: ${[p.category, p.subcategory].filter(Boolean).join(" › ")}`);
  lines.push(`Precio publicado: ${copFormat(p.price)}`, "", "¿Me pueden confirmar disponibilidad, precio actual y opciones de entrega?");
  return lines.join("\n");
}

/** Enlace wa.me con el texto codificado (acentos, emojis y saltos de línea intactos). */
export const whatsappUrl = (message: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
export const productWhatsappUrl = (p: InquiryProduct) => whatsappUrl(buildWhatsappMessage(p));
