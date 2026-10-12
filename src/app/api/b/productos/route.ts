import { NextResponse, type NextRequest } from "next/server";
import { allow } from "@/lib/auth/rate-limit";
import { assertRole, AuthorizationError } from "@/lib/auth/session";
import { accentPattern, queryWord, rankHits, searchTerm, type StaffProductHit } from "@/lib/catalog/staff-search";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Búsqueda de productos del catálogo para cotizar. Solo personal (técnico o SUPERADMIN) con sesión verificada; la consulta va con la
 * sesión del usuario (RLS) y está acotada (máx. 60 candidatos → 20 resultados). Precio y disponibilidad salen del catálogo vigente.
 */
export async function GET(req: NextRequest) {
  // Personal activo con MFA completado (aal2), igual que las acciones del panel.
  let profile;
  try {
    profile = await assertRole(["technician", "superadmin"]);
  } catch (e) {
    return json({ error: e instanceof AuthorizationError ? e.message : "forbidden" }, e instanceof AuthorizationError ? e.status : 403);
  }
  if (!(await allow("staff-product-search", profile.id, 120, 60))) return json({ error: "rate_limited" }, 429);
  const term = searchTerm(req.nextUrl.searchParams.get("q") ?? "");
  if (!term) return json({ results: [] });
  const pat = `%${accentPattern(queryWord(term))}%`;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, brand, source_ref, sku, price, image_url, is_active, source_available")
    .eq("is_active", true)
    .is("deleted_at", null)
    .or(`name.ilike.${pat},brand.ilike.${pat},source_ref.ilike.${pat},sku.ilike.${pat}`)
    .limit(60);
  if (error) return json({ error: "search_failed" }, 500);
  const hits: StaffProductHit[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    ref: p.source_ref ?? p.sku ?? null,
    price: Number(p.price),
    image: p.image_url,
    available: p.source_available !== false,
  }));
  return json({ results: rankHits(hits, term).slice(0, 20) });
}
