import type { Metadata } from "next";
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
  await requireRole(["admin"]);
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
      <div className="flex gap-2">
        {[7, 30, 90, 365].map((d) => (
          <a key={d} href={`/b/reportes?dias=${d}`} className={`rounded-full px-4 py-2 text-[14px] font-extrabold no-underline ${d === days ? "bg-ink text-white" : "border border-line bg-white text-ink-2"}`}>
            {d === 365 ? "1 año" : `${d} días`}
          </a>
        ))}
      </div>
      {error || !r ? (
        <Card>No pudimos cargar el reporte.</Card>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
            {kpis.map(([label, value]) => (
              <Card key={label} className="flex flex-col gap-1">
                <span className="text-[26px] font-extrabold leading-none">{value}</span>
                <span className="text-[13px] font-semibold text-muted">{label}</span>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="flex flex-col gap-2">
              <h2 className="m-0 text-[17px] font-extrabold">Tickets por estado (hoy)</h2>
              {Object.entries(r.tickets_by_status).map(([s, n]) => (
                <div key={s} className="flex justify-between text-[15px] font-semibold">
                  <span>{statusLabel(s)}</span>
                  <span>{n}</span>
                </div>
              ))}
            </Card>
            <Card className="flex flex-col gap-2">
              <h2 className="m-0 text-[17px] font-extrabold">Servicios más aprobados</h2>
              {r.top_services.length === 0 ? <p className="m-0 text-[14px] text-muted">Sin datos en el periodo.</p> : null}
              {r.top_services.map((s) => (
                <div key={s.name} className="flex justify-between text-[15px] font-semibold">
                  <span>{s.name}</span>
                  <span>{s.count}</span>
                </div>
              ))}
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
