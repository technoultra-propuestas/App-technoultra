import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalContent } from "@/components/legal/LegalContent";
import { SiteShell } from "@/components/site/SiteShell";
import { isLegalSlug, LEGAL_SLUGS, PUBLIC_LEGAL_SLUGS } from "@/lib/domain/legal";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 600;

async function load(slug: string) {
  if (!isLegalSlug(slug)) return null;
  const { data } = await createPublicClient().from("legal_documents").select("title, version, content, published_at").eq("slug", slug).eq("status", "published").maybeSingle();
  return data as { title: string; version: number; content: string; published_at: string } | null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = await load(slug);
  const label = LEGAL_SLUGS.find((s) => s.slug === slug)?.label;
  return {
    title: doc?.title ?? label ?? "Documento legal",
    alternates: { canonical: `/legal/${slug}` },
    robots: doc ? undefined : { index: false },
  };
}

/** Consulta pública de cada documento legal. Sin versión publicada se informa «en preparación» (nunca se muestra un borrador). */
export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();
  const doc = await load(slug);
  const label = LEGAL_SLUGS.find((s) => s.slug === slug)!.label;
  return (
    <SiteShell>
      <div className="mx-auto flex max-w-[960px] flex-col gap-6">
        <Link href="/legal" className="flex min-h-11 w-fit items-center text-[14px] font-bold text-muted no-underline">
          ← Todos los documentos legales
        </Link>
        {doc ? (
          <>
            <header className="flex flex-col gap-2">
              <h1 className="m-0 text-[30px] leading-tight font-extrabold tracking-[-0.025em] md:text-[36px]">{doc.title}</h1>
              <div className="h-1 w-10 rounded-sm bg-brand" />
              <p className="m-0 text-[13px] font-bold text-muted">
                Versión {doc.version} · vigente desde el{" "}
                {new Date(doc.published_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" })}
              </p>
            </header>
            <LegalContent content={doc.content} />
          </>
        ) : (
          <header className="flex flex-col gap-3 rounded-[20px] border border-line bg-white p-6">
            <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.02em]">{label}</h1>
            <p className="m-0 text-base leading-relaxed text-ink-2">Este documento está en revisión y todavía no tiene una versión vigente publicada. Cuando se publique, lo encontrarás aquí con su número de versión y fecha de vigencia.</p>
            <p className="m-0 text-[14px] text-muted">Si necesitas información antes de contratar, escríbenos por los canales de contacto de TechnoUltra.</p>
          </header>
        )}
        <nav aria-label="Otros documentos" className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-4 text-[14px] font-semibold">
          {PUBLIC_LEGAL_SLUGS.filter((s) => s.slug !== slug).map((s) => (
            <Link key={s.slug} href={`/legal/${s.slug}`} className="flex min-h-11 items-center text-ink-2">
              {s.label}
            </Link>
          ))}
        </nav>
      </div>
    </SiteShell>
  );
}
