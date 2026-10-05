import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/SiteShell";
import { Card } from "@/components/ui/layout";
import { priceText } from "@/lib/domain/catalog";
import { breadcrumbLd, faqLd, jsonLd, loadBusinessInfo, organizationLd } from "@/lib/seo";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "Soporte técnico remoto en toda Colombia",
  description: "Asistencia técnica remota para computadores en toda Colombia: configuración, optimización, limpieza de virus y más, sin salir de casa.",
  alternates: { canonical: "/soporte-remoto" },
};

const faq = [
  { q: "¿Qué necesito para el soporte remoto?", a: "Un computador con internet y una cuenta en la app. Nuestro técnico se conecta contigo en la fecha acordada." },
  { q: "¿Funciona en cualquier ciudad de Colombia?", a: "Sí. El soporte remoto no depende de tu ciudad. El servicio presencial solo está en Cali, Palmira, Jamundí y Yumbo." },
  { q: "¿Puedo ver el precio antes?", a: "Sí. Te mostramos la cotización y no empezamos hasta que la apruebes." },
];

export default async function RemoteSupportPage() {
  const sb = createPublicClient();
  const [{ data: services }, { data: areas }, biz] = await Promise.all([
    sb.from("services").select("slug, name, short_description, price_mode, base_price, price_unit, allowed_modalities").order("name"),
    sb.from("coverage_areas").select("city_name").eq("is_active", true),
    loadBusinessInfo(),
  ]);
  const remote = (services ?? []).filter((s) => (s.allowed_modalities as string[]).includes("remote"));
  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organizationLd(biz, (areas ?? []).map((a) => a.city_name))) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqLd(faq)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd([{ name: "Inicio", path: "/" }, { name: "Soporte remoto", path: "/soporte-remoto" }])) }} />
      <h1 className="m-0 text-[34px] font-extrabold tracking-[-0.03em]">Soporte técnico remoto en toda Colombia</h1>
      <div className="my-3 h-1 w-10 rounded-sm bg-brand" />
      <p className="mb-6 max-w-[640px] text-base leading-normal text-muted">Resolvemos muchos problemas de tu computador conectándonos a distancia, sin que tengas que moverte.</p>
      <ul className="m-0 mb-8 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3 p-0">
        {remote.map((s) => (
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
      {remote.length === 0 ? <p className="text-muted">Pronto publicaremos los servicios disponibles por soporte remoto.</p> : null}
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[20px] font-extrabold">Preguntas frecuentes</h2>
        {faq.map((f) => (
          <details key={f.q} className="rounded-[14px] border border-line bg-white p-4">
            <summary className="cursor-pointer text-[16px] font-extrabold">{f.q}</summary>
            <p className="mb-0 mt-2 text-[15px] leading-normal text-ink-2">{f.a}</p>
          </details>
        ))}
      </section>
    </SiteShell>
  );
}
