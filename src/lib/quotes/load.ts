import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findRelatedProducts, type RelatedProduct } from "@/lib/ai/related-products";
import { buildProposal, type CatalogService, type Proposal } from "@/lib/quotes/proposal";

/**
 * Texto que alimenta la propuesta: lo que contó el cliente, el diagnóstico técnico (si ya existe) y las causas de la IA
 * (ya revisadas por el técnico o no: solo sirven para PROPONER, nunca deciden). Usa el cliente del usuario (RLS).
 */
export async function loadProposal(supabase: SupabaseClient, ticketId: string): Promise<{ proposal: Proposal; text: string; products: RelatedProduct[] } | null> {
  const { data: t } = await supabase.from("tickets").select("id, problem").eq("id", ticketId).maybeSingle();
  if (!t) return null;
  const [{ data: d }, { data: ai }, { data: svc }] = await Promise.all([
    supabase.from("diagnostics").select("summary, tests_performed, recommendations, suggested_parts").eq("ticket_id", ticketId).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("ai_diagnostics").select("output, validation_status").eq("ticket_id", ticketId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("services").select("id, name, price_mode, base_price, is_diagnostic_fee").eq("is_active", true).is("deleted_at", null),
  ]);
  const causes = ((ai?.output as { causes?: { text: string }[] } | null)?.causes ?? []).map((c) => c.text);
  const text = [t.problem, d?.summary, d?.tests_performed, d?.recommendations, d?.suggested_parts, ...(ai?.validation_status === "rejected" ? [] : causes)].filter(Boolean).join("\n");
  const services = (svc ?? []).map((s) => ({ ...s, base_price: s.base_price === null ? null : Number(s.base_price) })) as CatalogService[];
  const proposal = buildProposal(text, services);
  // Productos del Shop que podrían ayudar: solo con evidencia en el texto (reglas explícitas, sin compatibilidad inventada).
  const products = d ? await findRelatedProducts(text, []).catch(() => []) : [];
  return { proposal, text, products };
}
