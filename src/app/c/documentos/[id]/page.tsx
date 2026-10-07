import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { InfoList, Panel } from "@/components/ui/detail";
import { fmtDateTime } from "@/components/ui/layout";
import { LinkButton } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { SIGNABLE } from "@/lib/documents/generate";
import { createClient } from "@/lib/supabase/server";
import { rejectDocumentAction } from "../actions";
import { SignatureForm } from "./signature-form";

export const metadata: Metadata = { title: "Documento", robots: { index: false } };

const STATUS: Record<string, string> = { generated: "Pendiente de revisar", sent: "Pendiente de revisar", viewed: "Pendiente de firmar", signed: "Firmado", rejected: "Rechazado", superseded: "Reemplazado por una versión nueva" };

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
    <section className="mx-auto flex w-full max-w-[680px] flex-col gap-5">
      <TextLink href="/c/documentos" className="w-fit">← Mis documentos</TextLink>
      <header className="flex flex-col gap-1 rounded-card bg-ink p-5 text-white shadow-card sm:p-6">
        <span className="text-[12px] font-extrabold uppercase tracking-[0.05em] text-[#B9B9B4]">{doc.code} · versión {doc.version}</span>
        <h1 className="m-0 text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-brand">{doc.title}</h1>
        <p className="m-0 text-[14px] font-bold text-[#D6D6D2]">{STATUS[doc.status] ?? doc.status}</p>
      </header>
      {sig ? (
        <div className="flex flex-col gap-1 rounded-card bg-ok-soft p-4 text-ok">
          <div className="text-[16px] font-extrabold">✓ Firmado por {sig.signer_name}</div>
          <div className="text-[13.5px] font-semibold">{fmtDateTime(sig.signed_at)}. Este documento ya no puede modificarse; una corrección genera una versión nueva.</div>
        </div>
      ) : null}
      <Panel title="Documento">
        <LinkButton href={`/documentos/${doc.id}`} target="_blank" rel="noreferrer">Abrir documento (PDF)</LinkButton>
        <InfoList rows={[{ label: "Generado", value: fmtDateTime(doc.generated_at) }, { label: "Huella SHA-256 (identifica esta versión exacta)", value: <span className="break-all text-[12px] font-semibold text-muted">{doc.sha256}</span> }]} />
      </Panel>
      {canSign ? (
        <Panel title="Firma electrónica de aceptación" hint="Lee el documento y, si estás de acuerdo, firma. Queda registrada con tu usuario, la fecha y la versión exacta.">
          <SignatureForm documentId={doc.id} code={doc.code} />
          <form action={rejectDocumentAction} className="border-t border-line pt-3">
            <input type="hidden" name="documentId" value={doc.id} />
            <button type="submit" className="min-h-11 rounded-[12px] border border-line-strong bg-white px-4 text-[14px] font-extrabold text-danger">No estoy de acuerdo</button>
          </form>
        </Panel>
      ) : null}
    </section>
  );
}
