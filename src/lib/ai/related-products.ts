import { matchHintRules } from "@/lib/ai/product-hints";
import { normKey } from "@/lib/catalog/normalize";
import { createPublicClient } from "@/lib/supabase/public";

export type RelatedProduct = { id: string; slug: string; name: string; brand: string | null; price: number; image_url: string | null; reason: string };

/**
 * Productos visibles del Shop (RLS público) que corresponden a las reglas que aplican a los síntomas. Hasta 3 por regla y 4 en total,
 * del más económico al más caro. Devuelve [] si ninguna regla aplica o si no hay productos en esas subcategorías.
 */
export async function findRelatedProducts(problem: string, causes: string[]): Promise<RelatedProduct[]> {
  const rules = matchHintRules(problem, causes);
  if (rules.length === 0) return [];
  const sb = createPublicClient();
  const { data: subs } = await sb.from("product_subcategories").select("id, name");
  const out: RelatedProduct[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    const wanted = new Set(rule.subcategories.map(normKey));
    const ids = (subs ?? []).filter((s) => wanted.has(normKey(s.name))).map((s) => s.id);
    if (ids.length === 0) continue;
    const { data } = await sb.from("products").select("id, slug, name, brand, price, image_url").not("source", "is", null).in("subcategory_id", ids).order("price", { ascending: true }).limit(3);
    for (const p of data ?? []) {
      if (seen.has(p.id) || out.length >= 4) continue;
      seen.add(p.id);
      out.push({ id: p.id, slug: p.slug, name: p.name, brand: p.brand, price: Number(p.price), image_url: p.image_url, reason: rule.reason });
    }
  }
  return out;
}
