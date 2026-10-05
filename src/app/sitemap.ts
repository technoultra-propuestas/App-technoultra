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
    { url: `${base}/soporte-remoto`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
  ];
  try {
    const sb = createPublicClient();
    const [{ data: services }, { data: areas }, { data: legal }] = await Promise.all([
      sb.from("services").select("slug, updated_at"),
      sb.from("coverage_areas").select("city_name, updated_at").eq("is_active", true),
      sb.from("legal_documents").select("slug, published_at").eq("status", "published"),
    ]);
    for (const s of services ?? []) entries.push({ url: `${base}/servicios/${s.slug}`, lastModified: new Date(s.updated_at), changeFrequency: "weekly", priority: 0.7 });
    for (const a of areas ?? []) entries.push({ url: `${base}/cobertura/${slugify(a.city_name)}`, lastModified: new Date(a.updated_at), changeFrequency: "monthly", priority: 0.8 });
    for (const l of legal ?? []) entries.push({ url: `${base}/legal/${l.slug}`, lastModified: new Date(l.published_at), changeFrequency: "yearly", priority: 0.3 });
  } catch {
    /* sin base de datos disponible: se devuelven solo las páginas fijas */
  }
  return entries;
}
