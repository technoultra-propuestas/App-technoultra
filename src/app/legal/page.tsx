import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/SiteShell";
import { PUBLIC_LEGAL_SLUGS } from "@/lib/domain/legal";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 600;
export const metadata: Metadata = { title: "Documentos legales", description: "Términos, tratamiento de datos, privacidad, garantías y demás condiciones de TechnoUltra.", alternates: { canonical: "/legal" } };

export default async function LegalIndexPage() {
  const { data } = await createPublicClient().from("legal_documents").select("slug, version, published_at").eq("status", "published");
  const published = new Map((data ?? []).map((d) => [d.slug as string, d as { slug: string; version: number; published_at: string }]));
  return (
    <SiteShell>
      <div className="mx-auto flex max-w-[860px] flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="m-0 text-[32px] leading-tight font-extrabold tracking-[-0.025em]">Documentos legales</h1>
          <div className="h-1 w-10 rounded-sm bg-brand" />
          <p className="m-0 text-base text-muted">Las condiciones que aplican a tu relación con TechnoUltra. Cada versión vigente queda registrada con su fecha.</p>
        </header>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3 p-0">
          {PUBLIC_LEGAL_SLUGS.map((s) => {
            const d = published.get(s.slug);
            return (
              <li key={s.slug}>
                <Link href={`/legal/${s.slug}`} className="flex h-full flex-col gap-1 rounded-[18px] border border-line bg-white p-4 no-underline">
                  <span className="text-[17px] font-extrabold text-ink">{s.label}</span>
                  <span className="text-[13px] font-semibold text-muted">{d ? `Versión ${d.version} · ${new Date(d.published_at).toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "America/Bogota" })}` : "En revisión"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </SiteShell>
  );
}
