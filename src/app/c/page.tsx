import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, money } from "@/components/ui/layout";
import type { NavIconName } from "@/components/ui/icons";
import { ListRow, PrimaryLink, Section, StatCard } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inicio", robots: { index: false } };

/** Qué significa cada estado para el cliente y qué le toca hacer (la máquina de estados no cambia; solo se explica). */
const STEP: Record<string, { title: string; icon: NavIconName; tone: "info" | "warn" | "ok" | "neutral"; weight: number }> = {
  awaiting_approval: { title: "Revisa y aprueba tu cotización", icon: "quote", tone: "warn", weight: 1 },
  ready: { title: "Tu equipo está listo para entregar", icon: "shield", tone: "ok", weight: 2 },
  received: { title: "Recibimos tu solicitud", icon: "inbox", tone: "info", weight: 5 },
  diagnosing: { title: "Estamos diagnosticando tu equipo", icon: "wrench", tone: "info", weight: 4 },
  awaiting_part: { title: "Esperamos un repuesto para tu equipo", icon: "box", tone: "neutral", weight: 4 },
  in_service: { title: "Estamos trabajando en tu equipo", icon: "wrench", tone: "info", weight: 4 },
  testing: { title: "Estamos probando tu equipo", icon: "shield", tone: "info", weight: 3 },
};

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function ClientHome() {
  const profile = await requireRole(["client"]);
  const supabase = await createClient();
  // Todo pasa por RLS: el cliente solo ve lo suyo.
  const [tickets, equipment, unread, unpaid] = await Promise.all([
    supabase.from("tickets").select("id, code, status, equipment(brand, model), services(name)").not("status", "in", "(delivered,cancelled)").order("received_at", { ascending: false }).limit(50),
    supabase.from("equipment").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).eq("channel", "in_app"),
    supabase.from("quotes").select("id, code, total, ticket_id").eq("status", "approved").is("paid_at", null).limit(10),
  ]);
  const active = tickets.data ?? [];
  const rows = [
    ...(unpaid.data ?? []).map((q) => (
      <ListRow key={`q-${q.id}`} href={`/c/tickets/${q.ticket_id}`} title="Paga tu cotización aprobada" detail={`${q.code} · ${money(q.total)}`} icon="quote" tone="warn" />
    )),
    ...active
      .filter((t) => STEP[t.status])
      .sort((a, b) => STEP[a.status].weight - STEP[b.status].weight)
      .map((t) => {
        const e = one(t.equipment as Rel<{ brand: string; model: string }>);
        const s = one(t.services as Rel<{ name: string }>);
        const s0 = STEP[t.status];
        return <ListRow key={t.id} href={`/c/tickets/${t.id}`} title={s0.title} icon={s0.icon} tone={s0.tone} detail={[t.code, s?.name, e ? `${e.brand} ${e.model}` : null].filter(Boolean).join(" · ")} />;
      }),
  ];
  const first = profile.full_name.split(" ")[0] || "bienvenido";

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">Hola, {first}</h1>
        <div>
          <PrimaryLink href="/c/solicitar" icon="plus">
            Solicitar un servicio
          </PrimaryLink>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard tone="dark" icon="ticket" value={active.length} label="Servicios en curso" href="/c/tickets" />
        <StatCard icon="box" value={equipment.count ?? 0} label="Equipos registrados" href="/c/equipos" />
        <StatCard icon="bell" value={unread.count ?? 0} label="Avisos sin leer" href="/avisos" />
      </div>
      <Link href="/c/asistente" className="press flex min-h-14 items-center justify-between gap-3 rounded-card border border-line bg-white px-5 py-3 text-ink no-underline shadow-card">
        <span className="flex flex-col">
          <span className="text-[15px] font-extrabold">Asistente TechnoUltra</span>
          <span className="text-[13px] font-semibold text-muted">Pregunta por servicios, precios, cobertura o tu solicitud.</span>
        </span>
        <span className="flex-none text-[13px] font-extrabold text-brand">Abrir</span>
      </Link>
      <Section title="Lo que sigue">
        {rows.length === 0 ? (
          <EmptyState title="No tienes nada pendiente" text="Cuando solicites un servicio, aquí verás qué está pasando y qué te toca hacer." />
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {rows.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </Section>
    </section>
  );
}
