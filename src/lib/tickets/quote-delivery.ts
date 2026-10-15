import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;
export type QuoteDelivery =
  | { state: "not_applicable" }
  | { state: "applied"; fee: number; city: string | null }
  | { state: "missing_fee"; city: string | null }
  | { state: "no_address" }
  | { state: "out_of_coverage" }
  | { state: "error" };

/**
 * Domicilio de la cotización para un ticket A DOMICILIO. El valor lo calcula el servidor/BD desde la cobertura del municipio de la dirección
 * (`set_quote_delivery`: nunca lo envía el cliente ni se escribe a mano). Es un concepto SEPARADO del precio del servicio.
 * Una tarifa de domicilio en 0 significa «sin tarifa configurada» (la recogida sí puede ser gratis): no se aplica un cargo inventado ni se
 * cotiza «gratis» en silencio; se avisa al personal para que la configure en Cobertura.
 */
export async function ensureQuoteDelivery(supabase: Supabase, quoteId: string, ticketId: string): Promise<QuoteDelivery> {
  const { data: t } = await supabase.from("tickets").select("modality").eq("id", ticketId).maybeSingle();
  if (!t || t.modality !== "home") return { state: "not_applicable" };
  const { error } = await supabase.rpc("set_quote_delivery", { p_quote: quoteId, p_apply: true });
  if (error) {
    if (/delivery_address_missing/.test(error.message)) return { state: "no_address" };
    if (/out_of_coverage/.test(error.message)) return { state: "out_of_coverage" };
    return { state: "error" };
  }
  const { data: q } = await supabase.from("quotes").select("delivery_fee, delivery_snapshot").eq("id", quoteId).maybeSingle();
  const fee = Number(q?.delivery_fee ?? 0);
  const city = ((q?.delivery_snapshot as { city?: string } | null)?.city as string | undefined) ?? null;
  if (!(fee > 0)) {
    await supabase.rpc("set_quote_delivery", { p_quote: quoteId, p_apply: false });
    return { state: "missing_fee", city };
  }
  return { state: "applied", fee, city };
}

export const deliveryNotice = (d: QuoteDelivery): string | null => {
  switch (d.state) {
    case "missing_fee":
      return `La zona${d.city ? ` de ${d.city}` : ""} no tiene tarifa de domicilio configurada: defínela en Cobertura y usa «Agregar domicilio». No se cobró ningún domicilio.`;
    case "no_address":
      return "El ticket a domicilio no tiene una dirección: no se pudo calcular el domicilio.";
    case "out_of_coverage":
      return "La dirección del ticket está fuera de cobertura para domicilio: no se aplicó ningún cargo.";
    case "error":
      return "No pudimos calcular el domicilio; usa «Agregar domicilio».";
    default:
      return null;
  }
};

/** Antes de ENVIAR una cotización de un ticket a domicilio debe estar el concepto de domicilio (o una cortesía explícita del personal). */
export async function deliveryBlocksSend(supabase: Supabase, quoteId: string, ticketId: string, waived: boolean): Promise<string | null> {
  if (waived) return null;
  const { data: t } = await supabase.from("tickets").select("modality").eq("id", ticketId).maybeSingle();
  if (!t || t.modality !== "home") return null;
  const { data: q } = await supabase.from("quotes").select("delivery_fee").eq("id", quoteId).maybeSingle();
  if (Number(q?.delivery_fee ?? 0) > 0) return null;
  return "Es un servicio a domicilio y la cotización no incluye el domicilio. Agrégalo (si la zona no tiene tarifa, configúrala en Cobertura) o marca «Enviar sin cobrar domicilio (cortesía)».";
}
