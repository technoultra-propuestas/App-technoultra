import { unstable_cache } from "next/cache";
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

async function loadFacetsRaw(): Promise<Facets & { brands: { cat: string | null; sub: string | null; brand: string }[] }> {
  const sb = createPublicClient();
  const [{ data: cats }, { data: subs }, { data: rows }] = await Promise.all([
    sb.from("product_categories").select("id, slug, name, sort_order, is_featured").order("sort_order").order("name"),
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
    // Destacadas primero, luego el orden que fijó el SUPERADMIN y por último el nombre.
    .sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || a.sort_order - b.sort_order || a.name.localeCompare(b.name, "es"));
  const brands = list.filter((r) => r.brand).map((r) => ({ cat: r.category_id, sub: r.subcategory_id, brand: r.brand as string }));
  return { categories, total: list.length, brands };
}

async function listProductsRaw(f: ListFilters, scope: { categoryId?: string; subcategoryId?: string }): Promise<{ products: CatalogProduct[]; total: number; page: number; pages: number }> {
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
  // «destacados» (por defecto): primero lo que el SUPERADMIN destacó, por su orden; luego por nombre.
  q =
    f.orden === "precio-asc"
      ? q.order("price", { ascending: true })
      : f.orden === "precio-desc"
        ? q.order("price", { ascending: false })
        : f.orden === "nombre"
          ? q.order("name", { ascending: true })
          : q.order("is_featured", { ascending: false }).order("featured_rank", { ascending: true }).order("name", { ascending: true });
  const { data, count } = await q.order("id").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const total = count ?? 0;
  return { products: (data ?? []).map((p) => ({ ...p, price: Number(p.price) })), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Productos destacados por el SUPERADMIN (visibles y disponibles), en el orden que definió. */
async function listFeaturedRaw(limit = 8): Promise<CatalogProduct[]> {
  const { data } = await createPublicClient()
    .from("products")
    .select("id, slug, name, brand, price, image_url, source_ref, category_id, subcategory_id")
    .not("source", "is", null)
    .eq("is_featured", true)
    .order("featured_rank", { ascending: true })
    .order("name", { ascending: true })
    .limit(limit);
  return (data ?? []).map((p) => ({ ...p, price: Number(p.price) }));
}

async function getProductBySlugRaw(slug: string) {
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

/**
 * Lecturas PÚBLICAS cacheadas (60 s, etiqueta «catalog»): son datos del catálogo visibles para cualquiera (cliente anónimo + RLS), así que
 * compartirlos entre visitantes es seguro y evita ir a la base en cada clic. La caché se invalida al instante cuando el SUPERADMIN edita
 * productos/ajustes o corre la sincronización (`revalidateTag("catalog")`). También deduplica la consulta que antes se hacía dos veces por
 * ficha (metadatos + página).
 */
// Configurable para pruebas (E2E la baja a 1 s porque cambia datos por SQL); en producción son 60 s.
const TTL = Math.max(1, Number(process.env.CATALOG_CACHE_SECONDS) || 60);
const opts = { revalidate: TTL, tags: ["catalog"] };
export const loadFacets = unstable_cache(loadFacetsRaw, ["catalog:facets"], opts);
export const listProducts = unstable_cache(listProductsRaw, ["catalog:list"], opts);
export const listFeatured = unstable_cache(listFeaturedRaw, ["catalog:featured"], opts);
export const getProductBySlug = unstable_cache(getProductBySlugRaw, ["catalog:product"], opts);
