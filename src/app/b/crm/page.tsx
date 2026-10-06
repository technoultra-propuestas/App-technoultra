import type { Metadata } from "next";
import { EmptyState, fmtDate, fmtDateTime } from "@/components/ui/layout";
import { ChipRow, FilterChip } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CRM_LABEL } from "@/lib/domain/crm";
import { dayKey } from "@/lib/domain/agenda";
import { InteractionForm } from "./interaction-form";

export const metadata: Metadata = { title: "CRM", robots: { index: false } };

const TYPE: Record<string, string> = { maintenance: "Mantenimiento", warranty: "Garantía", project: "Proyecto digital", followup: "Seguimiento" };
const TYPE_FILTERS = [
  ["all", "Todos"],
  ["maintenance", "Mantenimientos"],
  ["warranty", "Garantías"],
  ["project", "Proyectos digitales"],
  ["followup", "Seguimientos"],
] as const;
/** Columnas del tablero en el orden del mockup; los estados salen de la base (no se inventan). */
const COLUMNS = ["pending", "contacted", "interested", "scheduled", "done", "no_answer", "not_interested"] as const;

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(["technician", "superadmin"]);
  const sp = await searchParams;
  const tipo = TYPE_FILTERS.some(([k]) => k === sp.tipo) ? (sp.tipo as string) : "all";
  const supabase = await createClient();
  // RLS: el técnico solo ve las tareas que le asignaron; el SUPERADMIN, todas.
  const { data } = await supabase.from("crm_tasks").select("id, task_type, status, due_at, note, customers(full_name, phone), equipment(brand, model)").order("due_at").limit(300);
  const all = data ?? [];
  const tasks = tipo === "all" ? all : all.filter((t) => t.task_type === tipo);
  const ids = tasks.map((t) => t.id);
  const { data: inter } = ids.length ? await supabase.from("crm_interactions").select("id, task_id, channel, result, note, created_at").in("task_id", ids).order("created_at", { ascending: false }) : { data: [] };
  const today = dayKey(new Date());

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">{profile.role === "superadmin" ? "Seguimiento de clientes" : "Mis tareas de seguimiento"}</h1>
        <p className="m-0 mt-1.5 max-w-[760px] text-[15px] leading-normal text-muted">Mantenimientos, garantías por vencer y proyectos. Cada contacto queda registrado y no se puede editar.</p>
      </div>
      <ChipRow label="Filtrar por tipo">
        {TYPE_FILTERS.map(([k, label]) => (
          <FilterChip key={k} href={`/b/crm?tipo=${k}`} on={tipo === k} count={k === "all" ? all.length : all.filter((t) => t.task_type === k).length}>
            {label}
          </FilterChip>
        ))}
      </ChipRow>
      {all.length === 0 ? (
        <EmptyState title="Todavía no hay tareas de seguimiento" text="Se crean al entregar un equipo (mantenimiento), cuando vence una garantía y con cada proyecto digital." />
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 pb-3 lg:-mx-9 lg:px-9 [scroll-snap-type:x_proximity]">
          <div className="flex min-w-max items-start gap-3">
            {COLUMNS.map((col) => {
              const list = tasks.filter((t) => t.status === col);
              return (
                <section key={col} aria-label={CRM_LABEL[col]} className="w-[290px] flex-none [scroll-snap-align:start]">
                  <header className="mb-2 flex items-center justify-between px-1">
                    <h2 className="m-0 text-[15px] font-extrabold">{CRM_LABEL[col]}</h2>
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-[12px] font-extrabold shadow-card">{list.length}</span>
                  </header>
                  {list.length === 0 ? (
                    <div className="rounded-card border border-dashed border-line-strong p-4 text-[13px] font-semibold text-muted">Sin tareas</div>
                  ) : (
                    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                      {list.map((t) => {
                        const c = one(t.customers as Rel<{ full_name: string; phone: string | null }>);
                        const e = one(t.equipment as Rel<{ brand: string; model: string }>);
                        const history = (inter ?? []).filter((i) => i.task_id === t.id);
                        const closed = ["done", "not_interested"].includes(t.status);
                        const due = dayKey(t.due_at);
                        const overdue = !closed && due < today;
                        const dueToday = !closed && due === today;
                        return (
                          <li key={t.id}>
                            <article className={`flex flex-col gap-2 rounded-card border bg-white p-4 shadow-card ${overdue || dueToday ? "border-brand" : "border-line"}`}>
                              <div className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted">{TYPE[t.task_type] ?? t.task_type}</div>
                              <div className="text-[16px] font-extrabold leading-tight">{c?.full_name ?? "Cliente"}</div>
                              <div className="text-[13px] font-semibold leading-snug text-ink-2">
                                {[e ? `${e.brand} ${e.model}` : null, t.note].filter(Boolean).join(" · ")}
                              </div>
                              <div className="flex items-center justify-between gap-2 text-[12.5px] font-extrabold">
                                <span className={overdue ? "text-danger" : ""}>{dueToday ? "Hoy" : fmtDate(t.due_at)}{overdue ? " · vencida" : ""}</span>
                                {c?.phone ? (
                                  <a href={`tel:${c.phone}`} className="inline-flex min-h-11 items-center text-ink underline decoration-brand underline-offset-[3px]">
                                    {c.phone}
                                  </a>
                                ) : (
                                  <span className="text-muted">sin celular</span>
                                )}
                              </div>
                              {history.length > 0 ? (
                                <ul className="m-0 flex list-none flex-col gap-1 border-t border-line p-0 pt-2 text-[12.5px]">
                                  {history.slice(0, 3).map((h) => (
                                    <li key={h.id}>
                                      <span className="font-extrabold">{h.channel}</span> → {CRM_LABEL[h.result]} · {fmtDateTime(h.created_at)}
                                      {h.note ? ` — ${h.note}` : ""}
                                    </li>
                                  ))}
                                  {history.length > 3 ? <li className="font-semibold text-muted">+{history.length - 3} contactos anteriores</li> : null}
                                </ul>
                              ) : null}
                              <details>
                                <summary className="flex min-h-11 cursor-pointer items-center text-[13.5px] font-extrabold">Registrar contacto</summary>
                                <div className="pt-2">
                                  <InteractionForm taskId={t.id} />
                                </div>
                              </details>
                            </article>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
