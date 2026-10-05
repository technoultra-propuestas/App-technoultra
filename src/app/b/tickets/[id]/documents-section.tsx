import { Card, fmtDateTime } from "@/components/ui/layout";
import { createClient } from "@/lib/supabase/server";
import { GenerateDocForm } from "./document-forms";

const STATUS: Record<string, string> = { generated: "Generado", sent: "Enviado", viewed: "Visto por el cliente", signed: "Firmado", rejected: "Rechazado", superseded: "Reemplazado", draft: "Borrador" };
const AVAILABLE: Record<string, { kind: string; label: string }[]> = {
  received: [{ kind: "reception", label: "Acta de recepción" }],
  diagnosing: [{ kind: "reception", label: "Acta de recepción" }, { kind: "diagnosis", label: "Informe de diagnóstico" }],
  awaiting_approval: [{ kind: "diagnosis", label: "Informe de diagnóstico" }, { kind: "quote", label: "Cotización (PDF)" }],
  in_service: [{ kind: "quote", label: "Cotización (PDF)" }],
  testing: [{ kind: "quote", label: "Cotización (PDF)" }],
  ready: [{ kind: "delivery", label: "Acta de entrega" }],
  delivered: [{ kind: "delivery", label: "Acta de entrega" }, { kind: "warranty_product", label: "Garantía de producto" }, { kind: "warranty_labor", label: "Garantía de trabajo" }],
};

export async function DocumentsSection({ ticketId, status }: { ticketId: string; status: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("id, code, title, version, status, created_at, sha256").eq("ticket_id", ticketId).order("created_at", { ascending: false });
  const docs = data ?? [];
  const kinds = AVAILABLE[status] ?? [];
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="m-0 text-[17px] font-extrabold">Documentos</h2>
      {docs.length === 0 ? <p className="m-0 text-[14px] text-muted">Aún no se han generado documentos.</p> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 text-[14px]">
            <div className="min-w-0">
              <a href={`/documentos/${d.id}`} target="_blank" rel="noreferrer" className="font-extrabold text-ink underline decoration-brand underline-offset-[3px]">
                {d.title} · v{d.version}
              </a>
              <div className="text-[12px] text-muted">
                {d.code} · {fmtDateTime(d.created_at)} · SHA-256 {d.sha256.slice(0, 10)}…
              </div>
            </div>
            <span className="flex-none rounded-full bg-[#EDEDEA] px-3 py-1 text-[12px] font-extrabold">{STATUS[d.status] ?? d.status}</span>
          </li>
        ))}
      </ul>
      {kinds.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {kinds.map((k) => (
            <GenerateDocForm key={k.kind} ticketId={ticketId} kind={k.kind} label={`Generar ${k.label}`} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}
