import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, fmtDateTime, LinkButton, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { SIGNABLE } from "@/lib/documents/generate";
import { createClient } from "@/lib/supabase/server";
import { rejectDocumentAction } from "../actions";
import { SignatureForm } from "./signature-form";

export const metadata: Metadata = { title: "Documento", robots: { index: false } };

const STATUS: Record<string, string> = { generated: "Pendiente de revisar", sent: "Enviado", viewed: "Visto", signed: "Firmado", rejected: "Rechazado", superseded: "Reemplazado por una versión nueva" };

export default async function ClientDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["client"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("id, code, title, version, doc_type, status, sha256, generated_at, signed_at").eq("id", id.data).maybeSingle();
  if (!doc) notFound();
  const { data: sig } = await supabase.from("document_signatures").select("signed_at, signer_name").eq("document_id", doc.id).maybeSingle();
  const canSign = (SIGNABLE as string[]).includes(doc.doc_type) && ["generated", "sent", "viewed"].includes(doc.status);

  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <PageTitle title={doc.title} subtitle={`${doc.code} · versión ${doc.version} · ${STATUS[doc.status] ?? doc.status}`} />
      <Card className="flex flex-col gap-3">
        <LinkButton href={`/documentos/${doc.id}`} target="_blank" rel="noreferrer">
          Abrir documento (PDF)
        </LinkButton>
        <p className="m-0 break-all text-[12px] text-muted">Huella SHA-256: {doc.sha256}</p>
        <p className="m-0 text-[13px] text-muted">Generado el {fmtDateTime(doc.generated_at)}</p>
      </Card>
      {sig ? (
        <Card className="flex flex-col gap-1 bg-[#E3F3E8]">
          <div className="text-[16px] font-extrabold text-[#1F6B3A]">Firmado por {sig.signer_name}</div>
          <div className="text-[13px] text-[#1F6B3A]">{fmtDateTime(sig.signed_at)} · este documento ya no puede modificarse; una corrección genera una nueva versión.</div>
        </Card>
      ) : null}
      {canSign ? (
        <Card className="flex flex-col gap-4">
          <SignatureForm documentId={doc.id} code={doc.code} />
          <form action={rejectDocumentAction}>
            <input type="hidden" name="documentId" value={doc.id} />
            <button type="submit" className="min-h-11 rounded-[12px] border border-line-strong bg-white px-4 text-[14px] font-extrabold text-[#9A2B1E]">
              No estoy de acuerdo
            </button>
          </form>
        </Card>
      ) : null}
    </section>
  );
}
