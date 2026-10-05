import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, fmtDate, fmtDateTime, PageTitle } from "@/components/ui/layout";
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
    supabase.from("project_status_history").select("id, to_status, created_at").eq("project_id", p.id).order("created_at"),
  ]);
  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <PageTitle title={p.title} subtitle={`${p.code} · ${PROJECT_STATUS[p.status]}`} />
      <Card className="flex flex-col gap-3">
        <div className="flex justify-between text-[14px] font-extrabold">
          <span>Avance</span>
          <span>{p.progress}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-[#EDEDEA]" role="progressbar" aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-brand" style={{ width: `${p.progress}%` }} />
        </div>
        <div className="text-[13px] text-muted">
          {p.starts_on ? `Inicio ${fmtDate(p.starts_on)}` : ""}
          {p.due_on ? ` · Entrega estimada ${fmtDate(p.due_on)}` : ""}
        </div>
      </Card>
      {p.client_notes ? (
        <Card className="flex flex-col gap-1">
          <h2 className="m-0 text-[16px] font-extrabold">Actualización del equipo</h2>
          <p className="m-0 text-[15px] leading-normal">{p.client_notes}</p>
        </Card>
      ) : null}
      {p.scope ? (
        <Card className="flex flex-col gap-1">
          <h2 className="m-0 text-[16px] font-extrabold">Alcance</h2>
          <p className="m-0 whitespace-pre-line text-[15px] leading-normal text-ink-2">{p.scope}</p>
        </Card>
      ) : null}
      {(comments ?? []).length > 0 ? (
        <Card className="flex flex-col gap-2">
          <h2 className="m-0 text-[16px] font-extrabold">Mensajes</h2>
          {(comments ?? []).map((m) => (
            <p key={m.id} className="m-0 text-[15px] leading-normal">
              {m.body} <span className="text-[12px] text-muted">· {fmtDateTime(m.created_at)}</span>
            </p>
          ))}
        </Card>
      ) : null}
      <Card className="flex flex-col gap-2">
        <h2 className="m-0 text-[16px] font-extrabold">Historial</h2>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px] font-semibold">
          {(history ?? []).map((h) => (
            <li key={h.id} className="flex justify-between gap-2">
              <span>{PROJECT_STATUS[h.to_status]}</span>
              <span className="text-muted">{fmtDateTime(h.created_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
