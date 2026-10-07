import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { loadFacets } from "@/lib/catalog/queries";
import { CatalogView } from "../../catalog-view";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const cat = (await loadFacets()).categories.find((c) => c.slug === slug);
  if (!cat) return { title: "Categoría no encontrada", robots: { index: false } };
  return {
    title: `${cat.name} · Tienda`,
    description: `${cat.name}: ${cat.subs.map((s) => s.name).join(", ") || "productos"} con garantía de TechnoUltra. Consulta por WhatsApp.`,
    alternates: { canonical: `/tienda/categoria/${cat.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <SiteShell>
      <CatalogView catSlug={(await params).slug} sp={await searchParams} />
    </SiteShell>
  );
}
