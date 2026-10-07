import type { Metadata } from "next";
import { ChipRow, FilterChip, ListRow } from "@/components/ui/kit";
import { EmptyState, fmtDate, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis documentos", robots: { index: false } };

const STATUS: Record<string, { label: string; cls: string }> = {
  generated: { label: "Por revisar", cls: "bg-warn-soft text-warn" },
  sent: { label: "Por revisar", cls: "bg-warn-soft text-warn" },
  viewed: { label: "Visto", cls: "bg-info-soft text-info" },
  signed: { label: "Firmado", cls: "bg-ok-soft text-ok" },
  rejected: { label: "Rechazado", cls: "bg-danger-soft text-danger" },
  superseded: { label: "Reemplazado", cls: "bg-[#EDEDEA] text-ink-2" },
};
const FILTERS = [["", "Todos"], ["pendientes", "Por revisar o firmar"], ["firmados", "Firmados"]] as const;

/** Documentos del cliente: actas, cotizaciones, certificados, garantías y recomendaciones. Lo pendiente de revisar o firmar va destacado. */
export default async function ClientDocumentsPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await requireRole(["client"]);
  const ver = (await searchParams).ver ?? "";
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("id, code, title, version, status, created_at").order("created_at", { ascending: false }).limit(100);
  const all = data ?? [];
  const pending = all.filter((d) => ["generated", "sent", "viewed"].includes(d.status));
  const docs = ver === "pendientes" ? pending : ver === "firmados" ? all.filter((d) => d.status === "signed") : all;
  return (
    <section className="flex flex-col gap-5">
      <PageTitle title="Mis documentos" subtitle="Actas, cotizaciones, garantías y recomendaciones de tus servicios." />
      {pending.length > 0 ? <p role="status" className="m-0 rounded-[14px] bg-warn-soft px-4 py-3 text-[14px] font-bold text-warn">Tienes {pending.length} {pending.length === 1 ? "documento" : "documentos"} por revisar o firmar.</p> : null}
      <ChipRow label="Filtrar documentos">
        {FILTERS.map(([k, l]) => (
          <FilterChip key={k} href={k ? `/c/documentos?ver=${k}` : "/c/documentos"} on={ver === k}>{l}</FilterChip>
        ))}
      </ChipRow>
      {docs.length === 0 ? (
        <EmptyState title={all.length === 0 ? "Aún no tienes documentos" : "No hay documentos con este filtro"} text={all.length === 0 ? "Cuando recibamos tu equipo y avancemos con el servicio, los verás aquí." : undefined} />
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-card border border-line bg-white p-2 shadow-card">
          {docs.map((d) => {
            const s = STATUS[d.status] ?? { label: d.status, cls: "bg-[#EDEDEA] text-ink-2" };
            return (
              <li key={d.id}>
                <ListRow href={`/c/documentos/${d.id}`} title={`${d.title} · v${d.version}`} detail={`${d.code} · ${fmtDate(d.created_at)}`} icon="quote" tone={d.status === "signed" ? "ok" : ["generated", "sent", "viewed"].includes(d.status) ? "warn" : "neutral"} trailing={<span className={`flex-none rounded-full px-3 py-1 text-[12px] font-extrabold ${s.cls}`}>{s.label}</span>} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
