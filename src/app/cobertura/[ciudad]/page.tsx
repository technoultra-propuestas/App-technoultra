import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site/SiteShell";
import { Card, money, MODALITY_LABEL } from "@/components/ui/layout";
import { priceText } from "@/lib/domain/catalog";
import { slugify } from "@/lib/domain/service";
import { breadcrumbLd, faqLd, jsonLd, loadBusinessInfo, localBusinessLd, organizationLd, siteUrl } from "@/lib/seo";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 600;

type Area = { city_name: string; department: string; allowed_modalities: string[]; pickup_fee: number; home_fee: number };

/** La ciudad solo existe si está ACTIVA en la configuración de cobertura: no se afirma cobertura que no existe. */
async function load(slug: string) {
  const { data } = await createPublicClient().from("coverage_areas").select("city_name, department, allowed_modalities, pickup_fee, home_fee").eq("is_active", true);
  const all = (data ?? []) as Area[];
  return { area: all.find((a) => slugify(a.city_name) === slug) ?? null, all };
}

export async function generateMetadata({ params }: { params: Promise<{ ciudad: string }> }): Promise<Metadata> {
  const { area } = await load((await params).ciudad);
  if (!area) return { title: "Cobertura", robots: { index: false } };
  return {
    title: `Servicio técnico de computadores e impresoras en ${area.city_name}`,
    description: `Mantenimiento, reparación y soporte técnico en ${area.city_name}, ${area.department}. Recogida o servicio a domicilio, cotización previa y garantía. También soporte remoto.`,
    alternates: { canonical: `/cobertura/${slugify(area.city_name)}` },
  };
}

export default async function CityPage({ params }: { params: Promise<{ ciudad: string }> }) {
  const slug = (await params).ciudad;
  const { area, all } = await load(slug);
  if (!area) notFound();
  const sb = createPublicClient();
  const [{ data: services }, biz] = await Promise.all([sb.from("services").select("slug, name, short_description, price_mode, base_price, price_unit, price_type_label, parts_extra, allowed_modalities").order("sort_order").order("name"), loadBusinessInfo()]);
  const local = (services ?? []).filter((s) => (s.allowed_modalities as string[]).some((m) => area.allowed_modalities.includes(m)));
  const cities = all.map((a) => a.city_name);
  const faq = [
    { q: `¿Atienden en ${area.city_name}?`, a: `Sí. Prestamos servicio técnico presencial en ${area.city_name}: puedes llevar tu equipo al local, pedir que lo recojamos o que un técnico vaya a tu domicilio, según el servicio.` },
    { q: "¿Cobran el desplazamiento?", a: `${Number(area.pickup_fee) > 0 || Number(area.home_fee) > 0 ? `Recogida: ${money(area.pickup_fee)}. Servicio a domicilio: ${money(area.home_fee)}.` : "Actualmente no hay costo adicional de desplazamiento en esta ciudad."} Te lo mostramos antes de confirmar.` },
    { q: "¿Hacen algo sin avisarme?", a: "No. Primero diagnosticamos y te enviamos una cotización; solo trabajamos cuando la apruebas." },
    { q: "¿Y si estoy fuera de estas ciudades?", a: "Puedes usar el soporte remoto, disponible en toda Colombia para los servicios que lo permiten." },
  ];
  const org = organizationLd(biz, cities);
  const lb = localBusinessLd(biz, cities);
  const path = `/cobertura/${slugify(area.city_name)}`;
  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(org) }} />
      {lb ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(lb) }} /> : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqLd(faq)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd([{ name: "Inicio", path: "/" }, { name: "Cobertura", path: "/servicios" }, { name: area.city_name, path }])) }} />
      <h1 className="m-0 text-[34px] font-extrabold tracking-[-0.03em]">Servicio técnico en {area.city_name}</h1>
      <div className="my-3 h-1 w-10 rounded-sm bg-brand" />
      <p className="mb-6 max-w-[640px] text-base leading-normal text-muted">
        Atendemos computadores e impresoras en {area.city_name}, {area.department}. Elige cómo prefieres el servicio:{" "}
        {area.allowed_modalities.map((m) => MODALITY_LABEL[m]?.toLowerCase() ?? m).join(", ")}.
      </p>
      <section className="mb-8 flex flex-col gap-3">
        <h2 className="m-0 text-[20px] font-extrabold">Servicios disponibles en {area.city_name}</h2>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3 p-0">
          {local.map((s) => (
            <li key={s.slug}>
              <Link href={`/servicios/${s.slug}`} className="block h-full no-underline">
                <Card className="flex h-full flex-col gap-1.5">
                  <span className="text-[17px] font-extrabold text-ink">{s.name}</span>
                  {s.short_description ? <span className="text-[14px] text-muted">{s.short_description}</span> : null}
                  <span className="mt-auto pt-2 text-[15px] font-extrabold text-ink">{priceText(s)}</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        {local.length === 0 ? <p className="m-0 text-muted">Pronto publicaremos los servicios disponibles en esta ciudad.</p> : null}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[20px] font-extrabold">Preguntas frecuentes</h2>
        {faq.map((f) => (
          <details key={f.q} className="rounded-[14px] border border-line bg-white p-4">
            <summary className="cursor-pointer text-[16px] font-extrabold">{f.q}</summary>
            <p className="mb-0 mt-2 text-[15px] leading-normal text-ink-2">{f.a}</p>
          </details>
        ))}
      </section>
      <p className="mt-8 text-[13px] text-muted">
        También atendemos otras ciudades: {all.filter((a) => a.city_name !== area.city_name).map((a, i) => (
          <span key={a.city_name}>
            {i > 0 ? ", " : ""}
            <Link href={`/cobertura/${slugify(a.city_name)}`}>{a.city_name}</Link>
          </span>
        ))}
        . URL canónica: {siteUrl()}
        {path}
      </p>
    </SiteShell>
  );
}
