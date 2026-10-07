import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { InfoList, Panel, Timeline } from "@/components/ui/detail";
import { fmtDate, fmtDateTime } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { PROJECT_STATUS } from "@/lib/domain/projects";
import { createClient } from "@/lib/supabase/server";
import { ProjectCommentForm, ProjectForm } from "./forms";

export const metadata: Metadata = { title: "Proyecto", robots: { index: false } };

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["superadmin"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const { data: p } = await supabase.from("digital_projects").select("id, code, title, scope, status, progress, owner_id, starts_on, due_on, client_notes, customers(full_name, phone, email), services(name)").eq("id", id.data).is("deleted_at", null).maybeSingle();
  if (!p) notFound();
  const [{ data: comments }, { data: history }, { data: staff }] = await Promise.all([
    supabase.from("project_comments").select("id, body, visibility, created_at").eq("project_id", p.id).order("created_at", { ascending: false }),
    supabase.from("project_status_history").select("id, to_status, created_at").eq("project_id", p.id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email").in("role", ["technician", "superadmin"]).eq("is_active", true).order("full_name"),
  ]);
  const c = p.customers as unknown as { full_name: string; phone: string | null; email: string | null } | null;
  const svc = p.services as unknown as { name: string } | null;
  return (
    <section className="flex flex-col gap-5">
      <TextLink href="/b/proyectos" className="w-fit">← Proyectos</TextLink>
      <header className="flex flex-col gap-3 rounded-card bg-ink p-5 text-white shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-brand">{p.code}</h1>
            <p className="m-0 mt-1 text-[17px] font-bold leading-snug">{p.title}</p>
            <p className="m-0 mt-1 text-[13.5px] font-semibold text-[#D6D6D2]">{[svc?.name, c?.full_name].filter(Boolean).join(" · ")}</p>
          </div>
          <span className="rounded-full bg-brand px-3 py-1 text-[13px] font-extrabold text-ink">{PROJECT_STATUS[p.status]}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#2B2B2A]" role="progressbar" aria-label="Avance del proyecto" aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand" style={{ width: `${p.progress}%` }} />
          </div>
          <span className="text-[14px] font-extrabold">{p.progress}%</span>
        </div>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="flex flex-col gap-5">
          <Panel title="Datos del proyecto">
            <ProjectForm values={p} staff={(staff ?? []).map((s) => ({ id: s.id, name: s.full_name || s.email }))} />
          </Panel>
        </div>
        <aside className="flex flex-col gap-5">
          <Panel title="Cliente">
            <InfoList
              rows={[
                { label: "Nombre", value: c?.full_name },
                { label: "Teléfono", value: c?.phone ? <a href={`tel:${c.phone}`} className="underline decoration-brand underline-offset-[3px]">{c.phone}</a> : null },
                { label: "Correo", value: c?.email },
                { label: "Inicio", value: p.starts_on ? fmtDate(p.starts_on) : null },
                { label: "Entrega", value: p.due_on ? fmtDate(p.due_on) : null },
              ]}
            />
          </Panel>
          <Panel title="Comunicación" hint="Los mensajes «cliente» los ve la persona en su panel; los internos, no.">
            <ProjectCommentForm projectId={p.id} />
            <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
              {(comments ?? []).map((m) => (
                <li key={m.id} className="flex flex-col gap-0.5 py-2.5 text-[14px] leading-snug">
                  <span>{m.body}</span>
                  <span className="text-[12px] font-semibold text-muted">{m.visibility === "client" ? "Visible al cliente" : "Interno"} · {fmtDateTime(m.created_at)}</span>
                </li>
              ))}
              {(comments ?? []).length === 0 ? <li className="py-2 text-[14px] text-muted">Sin mensajes todavía.</li> : null}
            </ul>
          </Panel>
          <Panel title="Historial de estados">
            <Timeline items={(history ?? []).map((h) => ({ id: h.id, title: PROJECT_STATUS[h.to_status] ?? h.to_status, at: h.created_at }))} />
          </Panel>
        </aside>
      </div>
    </section>
  );
}
