import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { loadFacets } from "@/lib/catalog/queries";
import { CatalogView } from "../../../catalog-view";

type Params = Promise<{ slug: string; sub: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, sub } = await params;
  const cat = (await loadFacets()).categories.find((c) => c.slug === slug);
  const s = cat?.subs.find((x) => x.slug === sub);
  if (!cat || !s) return { title: "Categoría no encontrada", robots: { index: false } };
  return { title: `${s.name} · ${cat.name} · Tienda`, description: `${s.name} en ${cat.name} con garantía de TechnoUltra. Consulta por WhatsApp.`, alternates: { canonical: `/tienda/categoria/${cat.slug}/${s.slug}` } };
}

export default async function SubcategoryPage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug, sub } = await params;
  return (
    <SiteShell wide>
      <CatalogView catSlug={slug} subSlug={sub} sp={await searchParams} />
    </SiteShell>
  );
}
