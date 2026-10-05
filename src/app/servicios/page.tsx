import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/SiteShell";
import { Card } from "@/components/ui/layout";
import { priceText } from "@/lib/domain/catalog";
import { breadcrumbLd, jsonLd } from "@/lib/seo";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "Servicios técnicos y soluciones digitales",
  description: "Mantenimiento y reparación de computadores e impresoras, instalación de SSD y RAM, soporte remoto y proyectos digitales. Precios de referencia y garantía.",
  alternates: { canonical: "/servicios" },
};

export default async function ServicesIndex() {
  const sb = createPublicClient();
  const [{ data: services }, { data: cats }] = await Promise.all([
    sb.from("services").select("slug, name, kind, short_description, price_mode, base_price, price_unit, price_type_label, parts_extra, category_id").order("sort_order").order("name"),
    sb.from("service_categories").select("id, name, kind").order("sort_order"),
  ]);
  const list = services ?? [];
  const groups = (cats ?? []).map((c) => ({ ...c, items: list.filter((s) => s.category_id === c.id) })).filter((g) => g.items.length);
  const loose = list.filter((s) => !(cats ?? []).some((c) => c.id === s.category_id));
  if (loose.length) groups.push({ id: "otros", name: "Otros servicios", kind: "technical", items: loose });
  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd([{ name: "Inicio", path: "/" }, { name: "Servicios", path: "/servicios" }])) }} />
      <h1 className="m-0 text-[34px] font-extrabold tracking-[-0.03em]">Servicios técnicos y soluciones digitales</h1>
      <div className="my-3 h-1 w-10 rounded-sm bg-brand" />
      <p className="mb-8 max-w-[640px] text-base leading-normal text-muted">Atención presencial en Cali, Palmira, Jamundí y Yumbo, y soporte remoto en toda Colombia. Siempre te mostramos la cotización antes de hacer cualquier trabajo.</p>
      {groups.length === 0 ? <p className="text-muted">Pronto publicaremos el catálogo.</p> : null}
      {groups.map((g) => (
        <section key={g.id} className="mb-8 flex flex-col gap-3">
          <h2 className="m-0 text-[20px] font-extrabold">{g.name}</h2>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3 p-0">
            {g.items.map((s) => (
              <li key={s.slug}>
                <Link href={`/servicios/${s.slug}`} className="block h-full no-underline">
                  <Card className="flex h-full flex-col gap-1.5">
                    <span className="text-[17px] font-extrabold text-ink">{s.name}</span>
                    {s.short_description ? <span className="text-[14px] leading-snug text-muted">{s.short_description}</span> : null}
                    <span className="mt-auto pt-2 text-[15px] font-extrabold text-ink">{priceText(s)}</span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </SiteShell>
  );
}
