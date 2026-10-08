import { notFound } from "next/navigation";
import { loadFacets } from "@/lib/catalog/queries";

/** Categoría inexistente o sin productos visibles → 404 HTTP real, resuelto antes del esqueleto de carga (lectura cacheada). */
export default async function CategoryLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await loadFacets()).categories.some((c) => c.slug === slug)) notFound();
  return children;
}
