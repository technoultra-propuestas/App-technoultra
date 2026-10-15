import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { InfoList, Panel } from "@/components/ui/detail";
import { fmtDateTime } from "@/components/ui/layout";
import { LinkButton } from "@/components/ui/layout";
import { BackLink } from "@/components/ui/kit";
import { backTarget, safeReturnTo } from "@/lib/navigation";
import { requireRole } from "@/lib/auth/session";
import { SIGNABLE } from "@/lib/documents/generate";
import { createClient } from "@/lib/supabase/server";
import { rejectDocumentAction } from "../actions";
import { SignatureForm } from "./signature-form";

export const metadata: Metadata = { title: "Documento", robots: { index: false } };

const STATUS: Record<string, string> = { generated: "Pendiente de revisar", sent: "Pendiente de revisar", viewed: "Pendiente de firmar", signed: "Firmado", rejected: "Rechazado", superseded: "Reemplazado por una versión nueva" };

export default async function ClientDocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  await requireRole(["client"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("id, code, title, version, doc_type, status, sha256, generated_at, signed_at, ticket_id").eq("id", id.data).maybeSingle();
  if (!doc) notFound();
  const { data: sig } = await supabase.from("document_signatures").select("signed_at, signer_name").eq("document_id", doc.id).maybeSingle();
  const canSign = (SIGNABLE as string[]).includes(doc.doc_type) && ["generated", "sent", "viewed"].includes(doc.status);

  // Regreso al contexto real (el ticket o la cotización desde donde se abrió); sin contexto, al ticket del documento o a la lista.
  const back = backTarget((await searchParams).from, doc.ticket_id ? { href: `/c/tickets/${doc.ticket_id}`, label: "Volver a mi servicio" } : { href: "/c/documentos", label: "Volver a mis documentos" });
  // El origen solo viaja si es una ruta interna válida (un valor manipulado se descarta aquí, no se arrastra).
  const safeFrom = safeReturnTo((await searchParams).from);
  const viewerHref = `/c/documentos/${doc.id}/ver?from=${encodeURIComponent(`/c/documentos/${doc.id}${safeFrom ? `?from=${encodeURIComponent(safeFrom)}` : ""}`)}`;
  return (
    <section className={`mx-auto flex w-full max-w-[680px] flex-col gap-5 ${canSign ? "lg:max-w-[1040px]" : ""}`}>
      <BackLink href={back.href}>{back.label}</BackLink>
      <header className="flex flex-col gap-1 rounded-card bg-ink p-5 text-white shadow-card sm:p-6">
        <span className="text-[12px] font-extrabold uppercase tracking-[0.05em] text-[#B9B9B4]">{doc.code} · versión {doc.version}</span>
        <h1 className="m-0 text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-brand">{doc.title}</h1>
        <p className="m-0 text-[14px] font-bold text-[#D6D6D2]">{STATUS[doc.status] ?? doc.status}</p>
      </header>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-5">
          {sig ? (
            <div className="flex flex-col gap-1 rounded-card bg-ok-soft p-4 text-ok">
              <div className="text-[16px] font-extrabold">✓ Firmado por {sig.signer_name}</div>
              <div className="text-[13.5px] font-semibold">{fmtDateTime(sig.signed_at)}. Este documento ya no puede modificarse; una corrección genera una versión nueva.</div>
            </div>
          ) : null}
          <Panel title="Documento">
            <LinkButton href={viewerHref}>Ver documento (PDF)</LinkButton>
            <InfoList rows={[{ label: "Generado", value: fmtDateTime(doc.generated_at) }, { label: "Huella SHA-256 (identifica esta versión exacta)", value: <span className="break-all text-[12px] font-semibold text-muted">{doc.sha256}</span> }]} />
          </Panel>
        </div>
        {canSign ? (
          <Panel title="Firma electrónica de aceptación" hint="Lee el documento y, si estás de acuerdo, firma. Queda registrada con tu usuario, la fecha y la versión exacta.">
            <SignatureForm documentId={doc.id} code={doc.code} />
            <form action={rejectDocumentAction} className="border-t border-line pt-3">
              <input type="hidden" name="documentId" value={doc.id} />
              <button type="submit" className="min-h-11 rounded-[12px] border border-line-strong bg-white px-4 text-[14px] font-extrabold text-danger">No estoy de acuerdo</button>
            </form>
          </Panel>
        ) : null}
      </div>
    </section>
  );
}
