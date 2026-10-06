import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, money } from "@/components/ui/layout";
import { StatCard } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cotizaciones", robots: { index: false } };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const QUOTE_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-[#EDEDEA] text-ink-2" },
  sent: { label: "Enviada", cls: "bg-warn-soft text-warn" },
  clarification: { label: "Con pregunta", cls: "bg-warn-soft text-warn" },
  approved: { label: "Aprobada", cls: "bg-ok-soft text-ok" },
  rejected: { label: "Rechazada", cls: "bg-danger-soft text-danger" },
  expired: { label: "Vencida", cls: "bg-[#EDEDEA] text-ink-2" },
  superseded: { label: "Reemplazada", cls: "bg-[#EDEDEA] text-ink-2" },
};

export default async function StaffQuotesPage() {
  await requireRole(["technician", "superadmin"]);
  const supabase = await createClient();
  // RLS limita ambas consultas al rol: el técnico solo ve cotizaciones y tickets de lo que tiene asignado.
  const [quotes, pending] = await Promise.all([
    supabase.from("quotes").select("id, code, status, total, created_at, ticket_id, tickets(code, customers(full_name), equipment(brand, model))").order("created_at", { ascending: false }).limit(200),
    supabase.from("tickets").select("id, code, customers(full_name), equipment(brand, model), quotes(id)").eq("status", "diagnosing").order("received_at").limit(100),
  ]);
  const list = quotes.data ?? [];
  // «Por cotizar»: tickets en diagnóstico que todavía no tienen ninguna cotización.
  const toQuote = (pending.data ?? []).filter((t) => ((t.quotes as unknown as unknown[]) ?? []).length === 0);
  const waiting = list.filter((q) => q.status === "sent" || q.status === "clarification").length;
  const approved = list.filter((q) => q.status === "approved").length;
  const rejected = list.filter((q) => q.status === "rejected").length;
  const rate = approved + rejected > 0 ? `${Math.round((approved / (approved + rejected)) * 100)}%` : "—";

  return (
    <section className="flex flex-col gap-5">
      <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">Cotizaciones</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard value={toQuote.length} label="Por cotizar" />
        <StatCard value={waiting} label="Esperando respuesta" />
        <StatCard value={rate} label="Tasa de aprobación" />
      </div>
      {toQuote.length + list.length === 0 ? (
        <EmptyState title="Todavía no hay cotizaciones" text="Aparecerán aquí cuando un ticket pase a diagnóstico y se prepare su cotización." />
      ) : (
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-white p-0 shadow-card">
          {toQuote.map((t) => {
            const c = one(t.customers as Rel<{ full_name: string }>);
            const e = one(t.equipment as Rel<{ brand: string; model: string }>);
            return (
              <li key={`p-${t.id}`} className="border-b border-line last:border-0">
                <Row href={`/b/tickets/${t.id}`} code="Por cotizar" who={c?.full_name} sub={[t.code, e ? `${e.brand} ${e.model}` : null].filter(Boolean).join(" · ")} total={null} badge={{ label: "Pendiente", cls: "bg-warn-soft text-warn" }} />
              </li>
            );
          })}
          {list.map((q) => {
            const t = one(q.tickets as Rel<{ code: string; customers: Rel<{ full_name: string }>; equipment: Rel<{ brand: string; model: string }> }>);
            const c = one(t?.customers ?? null);
            const e = one(t?.equipment ?? null);
            return (
              <li key={q.id} className="border-b border-line last:border-0">
                <Row href={`/b/tickets/${q.ticket_id}`} code={q.code} who={c?.full_name} sub={[t?.code, e ? `${e.brand} ${e.model}` : null].filter(Boolean).join(" · ")} total={Number(q.total)} badge={QUOTE_BADGE[q.status] ?? { label: q.status, cls: "bg-[#EDEDEA] text-ink-2" }} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Row({ href, code, who, sub, total, badge }: { href: string; code: string; who?: string; sub: string; total: number | null; badge: { label: string; cls: string } }) {
  return (
    <Link href={href} className="press grid min-h-[64px] items-center gap-x-4 gap-y-1 px-5 py-3 text-ink no-underline hover:bg-paper md:grid-cols-[minmax(130px,0.9fr)_minmax(0,1.6fr)_120px_130px]">
      <span className="text-[15px] font-extrabold">{code}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14px] font-extrabold">{who ?? "Cliente"}</span>
        <span className="truncate text-[12.5px] font-semibold text-muted">{sub}</span>
      </span>
      <span className="text-[15px] font-extrabold md:text-right">{total === null ? "—" : money(total)}</span>
      <span className="justify-self-start md:justify-self-end">
        <span className={`inline-flex rounded-full px-3 py-1 text-[12.5px] font-extrabold ${badge.cls}`}>{badge.label}</span>
      </span>
    </Link>
  );
}
