import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, fmtDate, LinkButton, MODALITY_LABEL, PageTitle, StatusBadge } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tickets", robots: { index: false } };

const FILTERS = [
  ["open", "Abiertos"],
  ["received", "Recibidos"],
  ["diagnosing", "En diagnóstico"],
  ["awaiting_approval", "Por aprobar"],
  ["in_service", "En servicio"],
  ["testing", "En pruebas"],
  ["ready", "Listos"],
  ["closed", "Cerrados"],
] as const;

export default async function StaffTicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(["technician", "superadmin"]);
  const f = (await searchParams).estado ?? "open";
  const supabase = await createClient();
  // RLS: el técnico solo recibe los tickets que tiene asignados; el administrador, todos.
  let q = supabase
    .from("tickets")
    .select("id, code, status, modality, problem, created_at, customers(full_name), equipment(brand, model)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (f === "open") q = q.not("status", "in", "(delivered,cancelled)");
  else if (f === "closed") q = q.in("status", ["delivered", "cancelled"]);
  else if (FILTERS.some(([k]) => k === f)) q = q.eq("status", f as "received");
  const { data } = await q;
  const rows = data ?? [];
  return (
    <section className="flex flex-col gap-6">
      <PageTitle title={profile.role === "superadmin" ? "Tickets" : "Mis tickets"} action={<LinkButton href="/b/tickets/nuevo">Nuevo ticket</LinkButton>} />
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map(([k, label]) => (
          <Link
            key={k}
            href={`/b/tickets?estado=${k}`}
            className={`flex-none rounded-full px-4 py-2 text-[14px] font-extrabold no-underline ${f === k ? "bg-ink text-white" : "border border-line bg-white text-ink-2"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No hay tickets en este filtro" />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((t) => {
            const c = t.customers as unknown as { full_name: string } | null;
            const e = t.equipment as unknown as { brand: string; model: string } | null;
            return (
              <li key={t.id}>
                <Link href={`/b/tickets/${t.id}`} className="block no-underline">
                  <Card className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[16px] font-extrabold text-ink">
                        {t.code} · {c?.full_name ?? "Cliente"}
                      </div>
                      <div className="truncate text-[13px] font-semibold text-muted">
                        {e ? `${e.brand} ${e.model} · ` : ""}
                        {MODALITY_LABEL[t.modality]} · {fmtDate(t.created_at)}
                      </div>
                    </div>
                    <StatusBadge status={t.status} />
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
