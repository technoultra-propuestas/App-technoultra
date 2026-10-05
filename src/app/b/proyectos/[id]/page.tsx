import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, fmtDateTime, PageTitle } from "@/components/ui/layout";
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
    supabase.from("project_status_history").select("id, to_status, created_at").eq("project_id", p.id).order("created_at"),
    supabase.from("profiles").select("id, full_name, email").in("role", ["technician", "superadmin"]).eq("is_active", true).order("full_name"),
  ]);
  const c = p.customers as unknown as { full_name: string; phone: string | null; email: string | null } | null;
  return (
    <section className="grid gap-6 md:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-6">
        <PageTitle title={`${p.code} · ${p.title}`} subtitle={`${c?.full_name ?? ""}${c?.phone ? ` · ${c.phone}` : ""}`} />
        <Card>
          <ProjectForm values={p} staff={(staff ?? []).map((s) => ({ id: s.id, name: s.full_name || s.email }))} />
        </Card>
      </div>
      <aside className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Comunicación</h2>
          <ProjectCommentForm projectId={p.id} />
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {(comments ?? []).map((m) => (
              <li key={m.id} className="text-[14px] leading-snug">
                {m.body} <span className="text-[12px] text-muted">· {m.visibility === "client" ? "cliente" : "interno"} · {fmtDateTime(m.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="flex flex-col gap-2">
          <h2 className="m-0 text-[17px] font-extrabold">Historial de estados</h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] font-semibold">
            {(history ?? []).map((h) => (
              <li key={h.id} className="flex justify-between gap-2">
                <span>{PROJECT_STATUS[h.to_status]}</span>
                <span className="text-muted">{fmtDateTime(h.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </section>
  );
}
