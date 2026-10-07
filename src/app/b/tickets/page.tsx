import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, fmtDate, MODALITY_LABEL, StatusBadge } from "@/components/ui/layout";
import { ChipRow, FilterChip, PrimaryLink, SearchField } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tickets", robots: { index: false } };

const FILTERS = [
  ["open", "Activos"],
  ["all", "Todos"],
  ["received", "Solicitud recibida"],
  ["diagnosing", "En diagnóstico"],
  ["awaiting_approval", "Esperando aprobación"],
  ["awaiting_part", "Esperando repuesto"],
  ["in_service", "En servicio"],
  ["testing", "En pruebas"],
  ["ready", "Listo para entregar"],
  ["closed", "Cerrados"],
] as const;
const CLOSED = ["delivered", "cancelled"];

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default async function StaffTicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(["technician", "superadmin"]);
  const sp = await searchParams;
  const f = FILTERS.some(([k]) => k === sp.estado) ? (sp.estado as string) : "open";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const supabase = await createClient();
  // RLS: el técnico solo recibe los tickets que tiene asignados; el SUPERADMIN, todos.
  const { data } = await supabase
    .from("tickets")
    .select("id, code, status, modality, problem, created_at, customers(full_name), equipment(brand, model, serial)")
    .order("created_at", { ascending: false })
    .limit(500);
  const all = data ?? [];
  const counts: Record<string, number> = { all: all.length, open: all.filter((t) => !CLOSED.includes(t.status)).length, closed: all.filter((t) => CLOSED.includes(t.status)).length };
  for (const [k] of FILTERS) if (!(k in counts)) counts[k] = all.filter((t) => t.status === k).length;

  const needle = norm(q);
  const rows = all
    .filter((t) => (f === "all" ? true : f === "open" ? !CLOSED.includes(t.status) : f === "closed" ? CLOSED.includes(t.status) : t.status === f))
    .filter((t) => {
      if (!needle) return true;
      const c = one(t.customers as Rel<{ full_name: string }>);
      const e = one(t.equipment as Rel<{ brand: string; model: string; serial: string | null }>);
      return norm([t.code, c?.full_name, e?.brand, e?.model, e?.serial, t.problem].filter(Boolean).join(" ")).includes(needle);
    });

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">{profile.role === "superadmin" ? "Tickets" : "Mis tickets"}</h1>
        <PrimaryLink href="/b/tickets/nuevo" icon="plus">
          Nuevo ticket
        </PrimaryLink>
      </div>
      <div className="max-w-[560px]">
        <SearchField placeholder="Número, cliente o equipo" defaultValue={q} keep={{ estado: f === "open" ? undefined : f }} />
      </div>
      <ChipRow label="Filtrar por estado">
        {FILTERS.map(([k, label]) => (
          <FilterChip key={k} href={`/b/tickets?estado=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} count={counts[k]} on={f === k}>
            {label}
          </FilterChip>
        ))}
      </ChipRow>
      {rows.length === 0 ? (
        <EmptyState title={q ? "No encontramos tickets con esa búsqueda" : f === "open" ? "No hay tickets activos" : "No hay tickets en este estado"} text={q ? "Revisa el número, el nombre del cliente o el equipo." : counts.all > 0 ? "Elige «Todos» para ver el historial completo." : "Los tickets aparecerán aquí cuando se reciba una solicitud o se cree uno nuevo."} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((t) => {
            const c = one(t.customers as Rel<{ full_name: string }>);
            const e = one(t.equipment as Rel<{ brand: string; model: string }>);
            return (
              <li key={t.id}>
                <Link href={`/b/tickets/${t.id}`} className="press grid min-h-[72px] items-center gap-x-4 gap-y-1 rounded-card border border-line bg-white px-5 py-3.5 text-ink no-underline shadow-card md:grid-cols-[minmax(150px,0.9fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_auto]">
                  <span className="flex flex-col">
                    <span className="text-[15px] font-extrabold">{t.code}</span>
                    <span className="text-[13px] font-semibold text-muted">{fmtDate(t.created_at)}</span>
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-extrabold">{c?.full_name ?? "Cliente"}</span>
                    <span className="truncate text-[13px] font-semibold text-muted">
                      {e ? `${e.brand} ${e.model} · ` : ""}
                      {MODALITY_LABEL[t.modality]}
                    </span>
                  </span>
                  <span className="truncate text-[14px] text-ink-2">{t.problem}</span>
                  <span className="justify-self-start md:justify-self-end">
                    <StatusBadge status={t.status} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
