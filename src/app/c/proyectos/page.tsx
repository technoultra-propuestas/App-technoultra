import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, fmtDate, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { PROJECT_STATUS } from "@/lib/domain/projects";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis proyectos", robots: { index: false } };

export default async function ClientProjectsPage() {
  await requireRole(["client"]);
  const { data } = await (await createClient()).from("digital_projects").select("id, code, title, status, progress, due_on").is("deleted_at", null).order("created_at", { ascending: false });
  const rows = data ?? [];
  return (
    <section className="flex flex-col gap-6">
      <PageTitle title="Mis proyectos" subtitle="Seguimiento de tus páginas web, tiendas y aplicaciones." />
      {rows.length === 0 ? (
        <EmptyState title="Todavía no tienes proyectos" text="Pide una solución digital desde Servicios y te contactamos para entender lo que necesitas." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/c/proyectos/${p.id}`} className="block no-underline">
                <Card className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[16px] font-extrabold text-ink">{p.title}</div>
                      <div className="text-[13px] font-semibold text-muted">
                        {p.code}
                        {p.due_on ? ` · entrega estimada ${fmtDate(p.due_on)}` : ""}
                      </div>
                    </div>
                    <span className="flex-none rounded-full bg-[#EDEDEA] px-3 py-1 text-[12px] font-extrabold">{PROJECT_STATUS[p.status]}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#EDEDEA]" role="progressbar" aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-brand" style={{ width: `${p.progress}%` }} />
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
