import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site/SiteShell";
import { Card, MODALITY_LABEL } from "@/components/ui/layout";
import { priceText } from "@/lib/domain/catalog";
import { DIAGNOSIS_CONDITION } from "@/lib/domain/pricing";
import { slugify } from "@/lib/domain/service";
import { breadcrumbLd, jsonLd, siteUrl } from "@/lib/seo";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 600;

async function load(slug: string) {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return null;
  const { data } = await createPublicClient()
    .from("services")
    .select("slug, name, kind, short_description, description, price_mode, base_price, price_unit, price_type_label, parts_extra, includes_text, excludes_text, price_treatment, estimated_time, requires_diagnosis, is_diagnostic_fee, allowed_modalities, default_warranty_days, seo_title, seo_description, duration_minutes")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await load((await params).slug);
  if (!s) return { title: "Servicio no encontrado", robots: { index: false } };
  return {
    title: s.seo_title || s.name,
    description: s.seo_description || s.short_description || undefined,
    alternates: { canonical: `/servicios/${s.slug}` },
    openGraph: { title: s.seo_title || s.name, description: s.seo_description || s.short_description || undefined, url: `/servicios/${s.slug}` },
  };
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const s = await load((await params).slug);
  if (!s) notFound();
  const { data: areas } = await createPublicClient().from("coverage_areas").select("city_name").eq("is_active", true).order("city_name");
  const physical = (s.allowed_modalities as string[]).some((m) => m !== "remote");
  const remote = (s.allowed_modalities as string[]).includes("remote");
  const ld = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.name,
    description: s.description || s.short_description || undefined,
    provider: { "@type": "Organization", name: "TechnoUltra", url: siteUrl() },
    areaServed: [...(physical ? (areas ?? []).map((a) => ({ "@type": "City", name: a.city_name })) : []), ...(remote ? [{ "@type": "Country", name: "Colombia" }] : [])],
    ...(s.price_mode !== "quote" && s.base_price != null ? { offers: { "@type": "Offer", priceCurrency: "COP", price: String(s.base_price), url: `${siteUrl()}/servicios/${s.slug}` } } : {}),
  };
  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd([{ name: "Inicio", path: "/" }, { name: "Servicios", path: "/servicios" }, { name: s.name, path: `/servicios/${s.slug}` }])) }} />
      <nav aria-label="Ruta" className="mb-4 text-[13px] font-semibold text-muted">
        <Link href="/servicios" className="text-muted">Servicios</Link> / {s.name}
      </nav>
      <h1 className="m-0 text-[34px] font-extrabold tracking-[-0.03em]">{s.name}</h1>
      <div className="my-3 h-1 w-10 rounded-sm bg-brand" />
      <div className="grid gap-6 md:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          {s.short_description ? <p className="m-0 text-[17px] font-semibold leading-snug">{s.short_description}</p> : null}
          {s.description ? <p className="m-0 whitespace-pre-line text-base leading-relaxed text-ink-2">{s.description}</p> : null}
          {s.includes_text ? (
            <>
              <h2 className="m-0 mt-2 text-[20px] font-extrabold">Qué incluye</h2>
              <p className="m-0 text-[15px] leading-relaxed text-ink-2">{s.includes_text}</p>
            </>
          ) : null}
          {s.excludes_text ? (
            <>
              <h2 className="m-0 mt-2 text-[20px] font-extrabold">Qué no incluye</h2>
              <p className="m-0 text-[15px] leading-relaxed text-ink-2">{s.excludes_text}</p>
            </>
          ) : null}
          {s.price_treatment ? <p className="m-0 text-[14px] font-semibold text-muted">{s.price_treatment}</p> : null}
          <h2 className="m-0 mt-2 text-[20px] font-extrabold">¿Dónde y cómo?</h2>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[15px] font-semibold">
            {(s.allowed_modalities as string[]).map((m) => (
              <li key={m}>{MODALITY_LABEL[m] ?? m}</li>
            ))}
          </ul>
          {physical ? (
            <p className="m-0 text-[14px] text-muted">
              Atención presencial en:{" "}
              {(areas ?? []).map((a, i) => (
                <span key={a.city_name}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/cobertura/${slugify(a.city_name)}`}>{a.city_name}</Link>
                </span>
              ))}
              .
            </p>
          ) : null}
          {remote ? <p className="m-0 text-[14px] text-muted">Disponible por <Link href="/soporte-remoto">soporte remoto en toda Colombia</Link>.</p> : null}
        </div>
        <Card className="flex h-fit flex-col gap-3">
          <div className="text-[13px] font-bold text-muted">Precio de referencia</div>
          <div className="text-[26px] font-extrabold">{priceText(s)}</div>
          {s.default_warranty_days > 0 ? <div className="text-[14px] font-semibold">Garantía de {s.default_warranty_days} días</div> : null}
          {s.estimated_time ? <div className="text-[14px] text-muted">Tiempo estimado: {s.estimated_time}</div> : null}
          {s.requires_diagnosis ? <div className="text-[14px] font-semibold">Requiere diagnóstico previo.</div> : null}
          {s.is_diagnostic_fee ? <div className="text-[13px] font-semibold">{DIAGNOSIS_CONDITION}</div> : null}
          {s.price_mode === "from" ? <div className="text-[13px] text-muted">&quot;Desde&quot; es el valor mínimo: el precio final depende del modelo y el alcance.</div> : null}
          {s.duration_minutes && !s.estimated_time ?<div className="text-[14px] text-muted">Duración aproximada: {Math.round(s.duration_minutes / 60 * 10) / 10} h</div> : null}
          <Link href={`/c/solicitar/${s.slug}`} className="inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-brand px-5 text-[16px] font-extrabold text-ink no-underline">
            Solicitar este servicio
          </Link>
          <p className="m-0 text-[12px] text-muted">El precio final se confirma en la cotización, que siempre apruebas antes de cualquier trabajo.</p>
        </Card>
      </div>
    </SiteShell>
  );
}
