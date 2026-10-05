import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 3600;

const SLUGS = [
  "terms",
  "privacy",
  "data_policy",
  "warranty_policy",
  "service_terms",
  "purchase_terms",
  "returns_policy",
  "consents",
] as const;

async function load(slug: string) {
  if (!(SLUGS as readonly string[]).includes(slug)) return null;
  const { data } = await createPublicClient()
    .from("legal_documents")
    .select("title, version, content, published_at")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return data as { title: string; version: number; content: string; published_at: string } | null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const doc = await load((await params).slug);
  return {
    title: doc?.title ?? "Documento legal",
    alternates: { canonical: `/legal/${(await params).slug}` },
  };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const doc = await load((await params).slug);
  if (!doc) notFound();
  // Texto plano: se renderiza como texto (React escapa el contenido), nunca como HTML.
  const blocks = doc.content.split(/\n{2,}/);
  return (
    <main className="pt-safe pb-safe mx-auto max-w-[760px] px-5 py-10">
      <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">{doc.title}</h1>
      <div className="my-3 h-1 w-10 rounded-sm bg-brand" />
      <p className="mb-6 text-[13px] font-bold text-muted">
        Versión {doc.version} · publicada el{" "}
        {new Date(doc.published_at).toLocaleDateString("es-CO", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
      <div className="flex flex-col gap-4 text-base leading-relaxed text-ink-2">
        {blocks.map((b, i) => (
          <p key={i} className="m-0 whitespace-pre-line">
            {b}
          </p>
        ))}
      </div>
    </main>
  );
}
