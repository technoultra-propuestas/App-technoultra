import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, fmtDate, fmtDateTime, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CRM_LABEL } from "@/lib/domain/crm";
import { InteractionForm } from "./interaction-form";

export const metadata: Metadata = { title: "CRM", robots: { index: false } };

const TYPE: Record<string, string> = { maintenance: "Mantenimiento", warranty: "Garantía", project: "Proyecto", followup: "Seguimiento" };
const FILTERS = [["open", "Abiertas"], ...Object.entries(CRM_LABEL).filter(([k]) => k !== "pending")] as const;

export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(["technician", "superadmin"]);
  const f = (await searchParams).estado ?? "open";
  const supabase = await createClient();
  let q = supabase.from("crm_tasks").select("id, task_type, status, due_at, note, customers(full_name, phone), equipment(brand, model)").order("due_at").limit(100);
  if (f === "open") q = q.in("status", ["pending", "contacted", "interested", "scheduled", "no_answer"]);
  else if (f in CRM_LABEL) q = q.eq("status", f as "pending");
  const { data } = await q;
  const tasks = data ?? [];
  const ids = tasks.map((t) => t.id);
  const { data: inter } = ids.length ? await supabase.from("crm_interactions").select("id, task_id, channel, result, note, created_at").in("task_id", ids).order("created_at", { ascending: false }) : { data: [] };
  return (
    <section className="flex flex-col gap-6">
      <PageTitle title={profile.role === "superadmin" ? "CRM · seguimiento" : "Mis tareas de seguimiento"} subtitle="Mantenimientos, garantías por vencer y proyectos. Cada contacto queda registrado y no se puede editar." />
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={`/b/crm?estado=${k}`} className={`flex-none rounded-full px-4 py-2 text-[14px] font-extrabold no-underline ${f === k ? "bg-ink text-white" : "border border-line bg-white text-ink-2"}`}>
            {label}
          </Link>
        ))}
      </div>
      {tasks.length === 0 ? (
        <EmptyState title="No hay tareas en este filtro" />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {tasks.map((t) => {
            const c = t.customers as unknown as { full_name: string; phone: string | null } | null;
            const e = t.equipment as unknown as { brand: string; model: string } | null;
            const history = (inter ?? []).filter((i) => i.task_id === t.id);
            const overdue = new Date(t.due_at) < new Date() && !["done", "not_interested"].includes(t.status);
            return (
              <li key={t.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-[17px] font-extrabold">
                        {TYPE[t.task_type]} · {c?.full_name}
                      </div>
                      <div className="text-[13px] font-semibold text-muted">
                        {e ? `${e.brand} ${e.model} · ` : ""}
                        {c?.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : "sin celular"} · vence {fmtDate(t.due_at)}
                        {overdue ? " · vencida" : ""}
                      </div>
                      {t.note ? <p className="m-0 mt-1 text-[14px]">{t.note}</p> : null}
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[12px] font-extrabold ${overdue ? "bg-[#F7E4E1] text-[#9A2B1E]" : "bg-[#EDEDEA]"}`}>{CRM_LABEL[t.status]}</span>
                  </div>
                  {history.length > 0 ? (
                    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
                      {history.map((h) => (
                        <li key={h.id}>
                          <span className="font-bold">{h.channel}</span> → {CRM_LABEL[h.result]} · {fmtDateTime(h.created_at)}
                          {h.note ? ` — ${h.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <details>
                    <summary className="cursor-pointer text-[14px] font-extrabold">Registrar contacto</summary>
                    <div className="pt-3">
                      <InteractionForm taskId={t.id} />
                    </div>
                  </details>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
