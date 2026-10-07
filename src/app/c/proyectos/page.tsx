import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, fmtDate, PageTitle } from "@/components/ui/layout";
import { PrimaryLink } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { PROJECT_STATUS } from "@/lib/domain/projects";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis proyectos", robots: { index: false } };

export default async function ClientProjectsPage() {
  await requireRole(["client"]);
  const { data } = await (await createClient()).from("digital_projects").select("id, code, title, status, progress, due_on").is("deleted_at", null).order("created_at", { ascending: false });
  const rows = data ?? [];
  return (
    <section className="flex flex-col gap-5">
      <PageTitle title="Mis proyectos" subtitle="Seguimiento de tus páginas web, tiendas y aplicaciones." action={<PrimaryLink href="/c/solicitar?tipo=digital">Pedir una solución digital</PrimaryLink>} />
      {rows.length === 0 ? (
        <EmptyState title="Todavía no tienes proyectos" text="Pide una solución digital desde Servicios y te contactamos para entender lo que necesitas." action={<PrimaryLink href="/c/solicitar?tipo=digital">Ver soluciones digitales</PrimaryLink>} />
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-white p-0 shadow-card">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/c/proyectos/${p.id}`} className="press flex min-h-[76px] flex-col justify-center gap-2 px-5 py-3 text-ink no-underline hover:bg-paper">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[15.5px] font-extrabold">{p.title}</span>
                    <span className="block text-[13px] font-semibold text-muted">
                      {p.code}
                      {p.due_on ? ` · entrega estimada ${fmtDate(p.due_on)}` : ""}
                    </span>
                  </span>
                  <span className="flex-none rounded-full bg-[#EDEDEA] px-3 py-1 text-[12px] font-extrabold">{PROJECT_STATUS[p.status]}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#EDEDEA]" role="progressbar" aria-label={`Avance de ${p.code}`} aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-brand" style={{ width: `${p.progress}%` }} />
                  </div>
                  <span className="w-10 text-right text-[12.5px] font-extrabold text-muted">{p.progress}%</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
