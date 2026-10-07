import type { Metadata } from "next";
import Link from "next/link";
import { ChipRow, FilterChip, SearchField } from "@/components/ui/kit";
import { EmptyState, fmtDate, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { PROJECT_STATUS } from "@/lib/domain/projects";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Proyectos digitales", robots: { index: false } };

type Sp = { q?: string; estado?: string };
const OPEN = ["lead", "scoped", "in_progress", "review", "paused"];

/** Proyectos digitales: búsqueda, filtro por estado, avance y fecha de entrega. Solo SUPERADMIN. */
export default async function ProjectsAdminPage({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireRole(["superadmin"]);
  const sp = await searchParams;
  const q = (sp.q ?? "").replace(/[%_,()*\\]/g, " ").trim().slice(0, 60);
  const { data } = await (await createClient())
    .from("digital_projects")
    .select("id, code, title, status, progress, due_on, customers(full_name), services(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const all = data ?? [];
  const states = [...new Set(all.map((p) => p.status as string))];
  const rows = all.filter((p) => {
    const c = p.customers as unknown as { full_name: string } | null;
    const hay = `${p.code} ${p.title} ${c?.full_name ?? ""}`.toLowerCase();
    return (!q || hay.includes(q.toLowerCase())) && (!sp.estado || (sp.estado === "abiertos" ? OPEN.includes(p.status) : p.status === sp.estado));
  });
  const href = (estado?: string) => `/b/proyectos${[q ? `q=${encodeURIComponent(q)}` : "", estado ? `estado=${estado}` : ""].filter(Boolean).length ? `?${[q ? `q=${encodeURIComponent(q)}` : "", estado ? `estado=${estado}` : ""].filter(Boolean).join("&")}` : ""}`;
  return (
    <section className="flex flex-col gap-5">
      <PageTitle title="Proyectos digitales" subtitle="Webs, tiendas y aplicaciones: estado, avance y comunicación con el cliente. Nacen al recibir una solicitud digital." />
      <SearchField placeholder="Buscar por código, título o cliente" defaultValue={q} keep={{ estado: sp.estado }} />
      <ChipRow label="Estado">
        <FilterChip href={href()} on={!sp.estado} count={all.length}>Todos</FilterChip>
        <FilterChip href={href("abiertos")} on={sp.estado === "abiertos"} count={all.filter((p) => OPEN.includes(p.status)).length}>En curso</FilterChip>
        {states.map((s) => (
          <FilterChip key={s} href={href(s)} on={sp.estado === s} count={all.filter((p) => p.status === s).length}>{PROJECT_STATUS[s] ?? s}</FilterChip>
        ))}
      </ChipRow>
      {rows.length === 0 ? (
        <EmptyState title={all.length === 0 ? "Aún no hay proyectos" : "Ningún proyecto coincide"} text={all.length === 0 ? "Se crean desde Solicitudes cuando un cliente pide una solución digital." : "Cambia la búsqueda o el filtro."} />
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-white p-0 shadow-card">
          {rows.map((p) => {
            const c = p.customers as unknown as { full_name: string } | null;
            const s = p.services as unknown as { name: string } | null;
            return (
              <li key={p.id}>
                <Link href={`/b/proyectos/${p.id}`} className="press flex min-h-[76px] flex-col justify-center gap-2 px-5 py-3 text-ink no-underline hover:bg-paper">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[15.5px] font-extrabold">{p.code} · {p.title}</span>
                      <span className="block truncate text-[13px] font-semibold text-muted">
                        {c?.full_name} · {s?.name ?? "Proyecto"}
                        {p.due_on ? ` · entrega ${fmtDate(p.due_on)}` : ""}
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
            );
          })}
        </ul>
      )}
    </section>
  );
}
