import type { Metadata } from "next";
import { ChipRow, FilterChip, StatCard } from "@/components/ui/kit";
import { Panel } from "@/components/ui/detail";
import { Card, money, PageTitle, statusLabel } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reportes", robots: { index: false } };

type Report = {
  tickets_by_status: Record<string, number>;
  tickets_created: number;
  tickets_delivered: number;
  avg_days_to_deliver: number | null;
  quotes_sent: number;
  quotes_approved: number;
  quotes_rejected: number;
  revenue_cop: number;
  orders_paid: number;
  new_customers: number;
  ai_diagnostics: number;
  top_services: { name: string; count: number }[];
};

const dayStr = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
const rangeFor = (days: number) => {
  const now = Date.now();
  return { from: dayStr(new Date(now - days * 24 * 3600_000)), to: dayStr(new Date(now)) };
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["superadmin"]);
  const days = [7, 30, 90, 365].includes(Number((await searchParams).dias)) ? Number((await searchParams).dias) : 30;
  const { from, to } = rangeFor(days);
  const { data, error } = await (await createClient()).rpc("admin_report", { p_from: from, p_to: to });
  const r = data as Report | null;
  const kpis = r
    ? [
        ["Ingresos aprobados", money(r.revenue_cop)],
        ["Tickets creados", String(r.tickets_created)],
        ["Tickets entregados", String(r.tickets_delivered)],
        ["Días promedio a entrega", r.avg_days_to_deliver === null ? "—" : String(r.avg_days_to_deliver)],
        ["Cotizaciones enviadas", String(r.quotes_sent)],
        ["Aprobadas / rechazadas", `${r.quotes_approved} / ${r.quotes_rejected}`],
        ["Pedidos pagados", String(r.orders_paid)],
        ["Clientes nuevos", String(r.new_customers)],
        ["Diagnósticos con IA", String(r.ai_diagnostics)],
      ]
    : [];
  return (
    <section className="flex flex-col gap-6">
      <PageTitle title="Reportes" subtitle={`Del ${from} al ${to}. Solo datos agregados, sin información personal.`} />
      <ChipRow label="Periodo">
        {[7, 30, 90, 365].map((d) => (
          <FilterChip key={d} href={`/b/reportes?dias=${d}`} on={d === days}>{d === 365 ? "1 año" : `${d} días`}</FilterChip>
        ))}
      </ChipRow>
      {error || !r ? (
        <Card>No pudimos cargar el reporte.</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map(([label, value], i) => (
              <StatCard key={label} value={value} label={label} tone={i === 0 ? "dark" : "light"} />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Tickets por estado (hoy)">
              <Bars rows={Object.entries(r.tickets_by_status).map(([s, n]) => ({ label: statusLabel(s), value: n }))} empty="Sin tickets." />
            </Panel>
            <Panel title="Servicios más aprobados">
              <Bars rows={r.top_services.map((s) => ({ label: s.name, value: s.count }))} empty="Sin datos en el periodo." />
            </Panel>
          </div>
        </>
      )}
    </section>
  );
}

/** Barras horizontales proporcionales (sin librerías): el valor numérico siempre es visible para lectores de pantalla y para quien no distingue colores. */
function Bars({ rows, empty }: { rows: { label: string; value: number }[]; empty: string }) {
  if (!rows.length) return <p className="m-0 text-[14px] text-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {rows.map((r) => (
        <li key={r.label} className="flex flex-col gap-1">
          <div className="flex justify-between gap-3 text-[14px] font-bold">
            <span className="truncate">{r.label}</span>
            <span>{r.value}</span>
          </div>
          <div aria-hidden className="h-2 rounded-full bg-[#EDEDEA]">
            <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
