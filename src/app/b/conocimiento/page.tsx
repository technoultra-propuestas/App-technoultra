import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/layout";
import { ChipRow, FilterChip, PrimaryLink, SearchField, StatCard } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { setEntryStatusAction } from "./actions";

export const metadata: Metadata = { title: "Centro de conocimiento", robots: { index: false } };

const SOURCE_LABEL: Record<string, string> = { service: "Servicio", coverage: "Cobertura", setting: "Configuración", status: "Estado del ticket" };
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  published: { label: "Activa", cls: "bg-ok-soft text-ok" },
  draft: { label: "Borrador", cls: "bg-warn-soft text-warn" },
  archived: { label: "Archivada", cls: "bg-[#EDEDEA] text-ink-2" },
};
const FILTERS = [["all", "Todas"], ["published", "Activas"], ["draft", "Borradores"], ["archived", "Archivadas"], ["ai", "Usan IA"]] as const;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Fuera del componente: depende de la hora actual. */
function last30Days() {
  return new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
}
const num = (n: number) => n.toLocaleString("es-CO");

export default async function KnowledgeCenterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["superadmin"]);
  const sp = await searchParams;
  const f = FILTERS.some(([k]) => k === sp.estado) ? (sp.estado as string) : "all";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const supabase = await createClient();
  const since = last30Days();
  const [{ data: entries }, { data: usage }] = await Promise.all([
    supabase.from("knowledge_entries").select("id, category, title, question, status, source_type, source_id, uses_ai, priority, version, updated_at").order("category").order("priority", { ascending: false }).limit(500),
    supabase.from("ai_usage").select("route, tokens_input, tokens_output, latency_ms, error").gte("at", since).limit(5000),
  ]);
  const all = entries ?? [];
  const rows = all
    .filter((e) => (f === "all" ? true : f === "ai" ? e.uses_ai : e.status === f))
    .filter((e) => !q || norm([e.title, e.question, e.category].join(" ")).includes(norm(q)));

  const u = usage ?? [];
  const byRoute = (r: string) => u.filter((x) => x.route === r).length;
  const aiRows = u.filter((x) => x.route === "ai");
  const tIn = aiRows.reduce((s, x) => s + (x.tokens_input ?? 0), 0);
  const tOut = aiRows.reduce((s, x) => s + (x.tokens_output ?? 0), 0);
  const aiErrors = aiRows.filter((x) => x.error).length;
  const lat = aiRows.filter((x) => x.latency_ms).map((x) => x.latency_ms as number);
  const avgLat = lat.length ? Math.round(lat.reduce((s, x) => s + x, 0) / lat.length) : 0;
  const share = u.length ? Math.round((aiRows.length / u.length) * 100) : 0;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">Centro de conocimiento</h1>
          <p className="m-0 mt-1 max-w-[680px] text-[15px] leading-normal text-muted">Lo que responde el asistente sin gastar IA. Los precios y la cobertura salen de los servicios y la cobertura reales: aquí solo se escribe el texto.</p>
        </div>
        <PrimaryLink href="/b/conocimiento/nuevo" icon="plus">
          Nueva entrada
        </PrimaryLink>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="dark" icon="chart" value={u.length} label="Consultas (30 días)" />
        <StatCard icon="shield" value={`${share}%`} label={`Con IA · ${aiRows.length} de ${u.length}`} />
        <StatCard icon="box" value={`${num(tIn)} / ${num(tOut)}`} label="Tokens entrada / salida" />
        <StatCard icon="bell" value={aiErrors} label={`Errores de IA${avgLat ? ` · ${avgLat} ms prom.` : ""}`} />
      </div>
      <p className="m-0 text-[13px] text-muted">
        Por ruta: datos propios {byRoute("database")} · reglas {byRoute("deterministic")} · preguntas frecuentes {byRoute("faq")} · IA {byRoute("ai")} · respaldo {byRoute("fallback")}. No se guarda el texto de las conversaciones.
      </p>

      <div className="max-w-[560px]">
        <SearchField placeholder="Buscar pregunta o título" defaultValue={q} keep={{ estado: f === "all" ? undefined : f }} />
      </div>
      <ChipRow label="Filtrar">
        {FILTERS.map(([k, label]) => (
          <FilterChip key={k} href={`/b/conocimiento?estado=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} on={f === k} count={k === "all" ? all.length : k === "ai" ? all.filter((e) => e.uses_ai).length : all.filter((e) => e.status === k).length}>
            {label}
          </FilterChip>
        ))}
      </ChipRow>

      {rows.length === 0 ? (
        <EmptyState title="No hay entradas con ese filtro" text="Crea una nueva entrada o cambia el filtro." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
          <table className="w-full min-w-[720px] border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12px] uppercase tracking-[0.05em] text-muted">
                <th className="px-5 py-3 font-extrabold">Pregunta</th>
                <th className="px-3 py-3 font-extrabold">Fuente</th>
                <th className="px-3 py-3 font-extrabold">IA</th>
                <th className="px-3 py-3 font-extrabold">Estado</th>
                <th className="px-3 py-3 font-extrabold" aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const st = STATUS_LABEL[e.status] ?? STATUS_LABEL.draft;
                return (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">
                      <Link href={`/b/conocimiento/${e.id}`} className="flex min-h-11 flex-col justify-center text-ink no-underline">
                        <span className="font-extrabold">{e.question}</span>
                        <span className="text-[12.5px] font-semibold text-muted">
                          {e.category} · v{e.version}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-semibold text-ink-2">{e.source_type ? `${SOURCE_LABEL[e.source_type]}${e.source_id ? ` · ${e.source_id}` : ""}` : "Texto fijo"}</td>
                    <td className="px-3 py-3 font-extrabold">{e.uses_ai ? "Sí" : "No"}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[12.5px] font-extrabold ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <form action={setEntryStatusAction} className="inline">
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="status" value={e.status === "published" ? "archived" : "published"} />
                        <button type="submit" className="press min-h-11 rounded-[12px] border border-line-strong bg-white px-3.5 text-[13px] font-extrabold">
                          {e.status === "published" ? "Archivar" : "Publicar"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
