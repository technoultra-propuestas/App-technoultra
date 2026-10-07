import { PAGE_SIZE } from "./config";
import { normKey } from "./normalize";
import { createPublicClient } from "@/lib/supabase/public";

/** Lecturas PÚBLICAS del catálogo (cliente anónimo + RLS: solo productos activos y disponibles; nunca el costo del proveedor). */

export type Facets = {
  categories: { id: string; slug: string; name: string; count: number; subs: { id: string; slug: string; name: string; count: number }[] }[];
  total: number;
};
export type ListFilters = { cat?: string; sub?: string; q?: string; marca?: string; orden?: string; min?: number; max?: number; pagina?: number };
export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  price: number;
  image_url: string | null;
  source_ref: string | null;
  category_id: string | null;
  subcategory_id: string | null;
};

const sanitize = (s: string) => s.replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export async function loadFacets(): Promise<Facets & { brands: { cat: string | null; sub: string | null; brand: string }[] }> {
  const sb = createPublicClient();
  const [{ data: cats }, { data: subs }, { data: rows }] = await Promise.all([
    sb.from("product_categories").select("id, slug, name").order("name"),
    sb.from("product_subcategories").select("id, slug, name, category_id").order("name"),
    sb.from("products").select("category_id, subcategory_id, brand").not("source", "is", null).limit(5000),
  ]);
  const list = rows ?? [];
  const categories = (cats ?? [])
    .map((c) => ({
      ...c,
      count: list.filter((r) => r.category_id === c.id).length,
      subs: (subs ?? []).filter((s) => s.category_id === c.id).map((s) => ({ id: s.id, slug: s.slug, name: s.name, count: list.filter((r) => r.subcategory_id === s.id).length })).filter((s) => s.count > 0),
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const brands = list.filter((r) => r.brand).map((r) => ({ cat: r.category_id, sub: r.subcategory_id, brand: r.brand as string }));
  return { categories, total: list.length, brands };
}

export async function listProducts(f: ListFilters, scope: { categoryId?: string; subcategoryId?: string }): Promise<{ products: CatalogProduct[]; total: number; page: number; pages: number }> {
  const sb = createPublicClient();
  const page = Math.max(1, Math.floor(f.pagina ?? 1));
  let q = sb.from("products").select("id, slug, name, brand, price, image_url, source_ref, category_id, subcategory_id", { count: "exact" }).not("source", "is", null);
  if (scope.categoryId) q = q.eq("category_id", scope.categoryId);
  if (scope.subcategoryId) q = q.eq("subcategory_id", scope.subcategoryId);
  if (f.marca) q = q.ilike("brand", sanitize(f.marca));
  const term = f.q ? sanitize(f.q) : "";
  if (term) q = q.or(`name.ilike.%${term}%,brand.ilike.%${term}%,source_ref.ilike.%${term}%`);
  if (f.min && f.min > 0) q = q.gte("price", f.min);
  if (f.max && f.max > 0) q = q.lte("price", f.max);
  q = f.orden === "precio-asc" ? q.order("price", { ascending: true }) : f.orden === "precio-desc" ? q.order("price", { ascending: false }) : q.order("name", { ascending: true });
  const { data, count } = await q.order("id").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const total = count ?? 0;
  return { products: (data ?? []).map((p) => ({ ...p, price: Number(p.price) })), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getProductBySlug(slug: string) {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return null;
  const sb = createPublicClient();
  const { data: p } = await sb
    .from("products")
    .select("id, slug, name, brand, description, price, image_url, source_ref, warranty_days, category_id, subcategory_id, product_categories(name, slug), product_subcategories(name, slug)")
    .eq("slug", slug)
    .not("source", "is", null)
    .maybeSingle();
  if (!p) return null;
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? (v[0] ?? null) : v);
  return { ...p, price: Number(p.price), category: one(p.product_categories as { name: string; slug: string } | { name: string; slug: string }[] | null), subcategory: one(p.product_subcategories as { name: string; slug: string } | { name: string; slug: string }[] | null) };
}

export const brandKey = normKey;
