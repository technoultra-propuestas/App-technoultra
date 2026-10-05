import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, fmtDate, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { PROJECT_STATUS } from "@/lib/domain/projects";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Proyectos digitales", robots: { index: false } };

export default async function ProjectsAdminPage() {
  await requireRole(["admin"]);
  const { data } = await (await createClient())
    .from("digital_projects")
    .select("id, code, title, status, progress, due_on, customers(full_name), services(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = data ?? [];
  return (
    <section className="flex flex-col gap-6">
      <PageTitle title="Proyectos digitales" subtitle="Webs, tiendas y aplicaciones: estado, avance y comunicación con el cliente. Los proyectos nacen al recibir una solicitud digital." />
      {rows.length === 0 ? (
        <EmptyState title="Aún no hay proyectos" text="Se crean desde Solicitudes cuando un cliente pide una solución digital." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((p) => {
            const c = p.customers as unknown as { full_name: string } | null;
            const s = p.services as unknown as { name: string } | null;
            return (
              <li key={p.id}>
                <Link href={`/b/proyectos/${p.id}`} className="block no-underline">
                  <Card className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[16px] font-extrabold text-ink">
                          {p.code} · {p.title}
                        </div>
                        <div className="truncate text-[13px] font-semibold text-muted">
                          {c?.full_name} · {s?.name ?? "Proyecto"}
                          {p.due_on ? ` · entrega ${fmtDate(p.due_on)}` : ""}
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
            );
          })}
        </ul>
      )}
    </section>
  );
}
