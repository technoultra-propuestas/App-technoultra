import type { MetadataRoute } from "next";
import { slugify } from "@/lib/domain/service";
import { siteUrl } from "@/lib/seo";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 3600;

/** Solo URLs reales y públicas: servicios activos, ciudades con cobertura activa y textos legales publicados. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/servicios`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/tienda`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/soporte-remoto`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
  ];
  try {
    const sb = createPublicClient();
    const [{ data: services }, { data: areas }, { data: legal }] = await Promise.all([
      sb.from("services").select("slug, updated_at"),
      sb.from("coverage_areas").select("city_name, updated_at").eq("is_active", true),
      sb.from("legal_documents").select("slug, published_at").eq("status", "published"),
    ]);
    const [{ data: pcats }, { data: psubs }, { data: prods }] = await Promise.all([
      sb.from("product_categories").select("id, slug, updated_at"),
      sb.from("product_subcategories").select("category_id, slug, updated_at"),
      sb.from("products").select("slug, category_id, updated_at").not("source", "is", null).limit(5000),
    ]);
    const visibleCats = new Set((prods ?? []).map((p) => p.category_id));
    for (const c of pcats ?? []) if (visibleCats.has(c.id)) entries.push({ url: `${base}/tienda/categoria/${c.slug}`, lastModified: new Date(c.updated_at), changeFrequency: "daily", priority: 0.7 });
    for (const s of psubs ?? []) {
      const c = (pcats ?? []).find((x) => x.id === s.category_id);
      if (c && visibleCats.has(c.id)) entries.push({ url: `${base}/tienda/categoria/${c.slug}/${s.slug}`, lastModified: new Date(s.updated_at), changeFrequency: "daily", priority: 0.6 });
    }
    for (const p of prods ?? []) entries.push({ url: `${base}/tienda/producto/${p.slug}`, lastModified: new Date(p.updated_at), changeFrequency: "daily", priority: 0.6 });
    for (const s of services ?? []) entries.push({ url: `${base}/servicios/${s.slug}`, lastModified: new Date(s.updated_at), changeFrequency: "weekly", priority: 0.7 });
    for (const a of areas ?? []) entries.push({ url: `${base}/cobertura/${slugify(a.city_name)}`, lastModified: new Date(a.updated_at), changeFrequency: "monthly", priority: 0.8 });
    for (const l of legal ?? []) entries.push({ url: `${base}/legal/${l.slug}`, lastModified: new Date(l.published_at ?? Date.now()), changeFrequency: "yearly", priority: 0.3 });
  } catch {
    /* sin base de datos disponible: se devuelven solo las páginas fijas */
  }
  return entries;
}
