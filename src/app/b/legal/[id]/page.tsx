import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { LegalContent } from "@/components/legal/LegalContent";
import { Card, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { LEGAL_SLUGS, pendingMarkers } from "@/lib/domain/legal";
import { createClient } from "@/lib/supabase/server";
import { EditDraftForm } from "../forms";

export const metadata: Metadata = { title: "Revisar documento legal", robots: { index: false } };

/** Vista previa interna (solo SUPERADMIN) de cualquier versión, incluidos borradores que el público no ve. */
export default async function LegalPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["superadmin"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { data: doc } = await (await createClient()).from("legal_documents").select("id, slug, version, title, status, content, requires_acceptance, content_sha256").eq("id", id.data).maybeSingle();
  if (!doc) notFound();
  const pending = pendingMarkers(doc.content);
  const label = LEGAL_SLUGS.find((s) => s.slug === doc.slug)?.label ?? doc.slug;
  return (
    <section className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
      <PageTitle title={doc.title} subtitle={`${label} · versión ${doc.version} · ${doc.status === "draft" ? "BORRADOR (no es público)" : doc.status === "published" ? "Publicado" : "Retirado"}`} />
      <Link href="/b/legal" className="flex min-h-11 w-fit items-center text-[14px] font-bold">← Centro legal</Link>
      {pending.length ? (
        <p role="status" className="m-0 rounded-xl bg-[#FFF3C9] px-4 py-3 text-[14px] font-bold text-[#6E4B00]">Datos pendientes: {pending.join(" · ")}. Complétalos en el Centro legal para poder publicar.</p>
      ) : null}
      <Card>
        <LegalContent content={doc.content} />
      </Card>
      <p className="m-0 break-all text-[12px] text-muted">Huella SHA-256 del contenido: {doc.content_sha256}</p>
      {doc.status === "draft" ? (
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[19px] font-extrabold">Editar borrador</h2>
          <EditDraftForm id={doc.id} title={doc.title} content={doc.content} />
        </Card>
      ) : null}
    </section>
  );
}
