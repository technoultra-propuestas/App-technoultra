import { notFound } from "next/navigation";
import { loadFacets } from "@/lib/catalog/queries";

/** Subcategoría inexistente o sin productos visibles → 404 HTTP real, resuelto antes del esqueleto de carga (lectura cacheada). */
export default async function SubcategoryLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string; sub: string }> }) {
  const { slug, sub } = await params;
  const cat = (await loadFacets()).categories.find((c) => c.slug === slug);
  if (!cat || !cat.subs.some((s) => s.slug === sub)) notFound();
  return children;
}
