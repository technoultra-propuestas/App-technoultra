import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Panel, Timeline } from "@/components/ui/detail";
import { fmtDate, fmtDateTime } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { PROJECT_STATUS } from "@/lib/domain/projects";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Proyecto", robots: { index: false } };

export default async function ClientProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["client"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  // RLS: solo el dueño; los comentarios internos nunca llegan al cliente.
  const { data: p } = await supabase.from("digital_projects").select("id, code, title, scope, status, progress, starts_on, due_on, client_notes").eq("id", id.data).is("deleted_at", null).maybeSingle();
  if (!p) notFound();
  const [{ data: comments }, { data: history }] = await Promise.all([
    supabase.from("project_comments").select("id, body, created_at").eq("project_id", p.id).order("created_at", { ascending: false }),
    supabase.from("project_status_history").select("id, to_status, created_at").eq("project_id", p.id).order("created_at", { ascending: false }),
  ]);
  return (
    <section className="mx-auto flex w-full max-w-[680px] flex-col gap-5">
      <TextLink href="/c/proyectos" className="w-fit">← Mis proyectos</TextLink>
      <header className="flex flex-col gap-3 rounded-card bg-ink p-5 text-white shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[12px] font-extrabold uppercase tracking-[0.05em] text-[#B9B9B4]">{p.code}</span>
            <h1 className="m-0 text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-brand">{p.title}</h1>
          </div>
          <span className="rounded-full bg-brand px-3 py-1 text-[13px] font-extrabold text-ink">{PROJECT_STATUS[p.status]}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#2B2B2A]" role="progressbar" aria-label="Avance del proyecto" aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand" style={{ width: `${p.progress}%` }} />
          </div>
          <span className="text-[15px] font-extrabold">{p.progress}%</span>
        </div>
        {p.starts_on || p.due_on ? (
          <p className="m-0 text-[13px] font-semibold text-[#D6D6D2]">
            {p.starts_on ? `Inicio ${fmtDate(p.starts_on)}` : ""}
            {p.starts_on && p.due_on ? " · " : ""}
            {p.due_on ? `Entrega estimada ${fmtDate(p.due_on)}` : ""}
          </p>
        ) : null}
      </header>
      {p.client_notes ? (
        <Panel title="Actualización del equipo">
          <p className="m-0 text-[15px] leading-normal">{p.client_notes}</p>
        </Panel>
      ) : null}
      {p.scope ? (
        <Panel title="Alcance">
          <p className="m-0 whitespace-pre-line text-[15px] leading-normal text-ink-2">{p.scope}</p>
        </Panel>
      ) : null}
      {(comments ?? []).length > 0 ? (
        <Panel title="Mensajes del equipo">
          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {(comments ?? []).map((m) => (
              <li key={m.id} className="flex flex-col gap-0.5 py-2.5 text-[15px] leading-normal">
                <span>{m.body}</span>
                <span className="text-[12px] font-semibold text-muted">{fmtDateTime(m.created_at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <Panel title="Historial">
        <Timeline items={(history ?? []).map((h) => ({ id: h.id, title: PROJECT_STATUS[h.to_status] ?? h.to_status, at: h.created_at }))} />
      </Panel>
    </section>
  );
}
