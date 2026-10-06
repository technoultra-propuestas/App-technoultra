import type { Metadata } from "next";
import Link from "next/link";
import type { NavIconName } from "@/components/ui/icons";
import { ListRow, PrimaryLink, Section, StatCard, TextLink } from "@/components/ui/kit";
import { addDays, dayKey, greeting, longDate, startOfDay, timeLabel } from "@/lib/domain/agenda";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inicio", robots: { index: false } };

/** Qué hay que hacer con un ticket según su estado real (la máquina de estados no cambia; solo se nombra la acción). */
const NEXT_ACTION: Record<string, { title: string; icon: NavIconName; tone: "info" | "warn" | "ok" | "neutral"; weight: number }> = {
  testing: { title: "Completar pruebas", icon: "shield", tone: "info", weight: 1 },
  ready: { title: "Coordinar entrega", icon: "shield", tone: "ok", weight: 2 },
  diagnosing: { title: "Terminar diagnóstico y cotizar", icon: "wrench", tone: "warn", weight: 3 },
  received: { title: "Iniciar diagnóstico", icon: "box", tone: "info", weight: 4 },
  awaiting_part: { title: "Revisar llegada del repuesto", icon: "box", tone: "neutral", weight: 5 },
  awaiting_approval: { title: "Seguir la cotización con el cliente", icon: "quote", tone: "warn", weight: 6 },
  in_service: { title: "Continuar el servicio", icon: "wrench", tone: "info", weight: 7 },
};
const EVENT_TONE: Record<string, string> = {
  reception: "border-l-[#4F6EA8] bg-[#EEF1F6]",
  diagnosis: "border-l-[#C9961A] bg-[#FBF1D9]",
  delivery: "border-l-[#2E8B57] bg-[#E3F3E8]",
  maintenance: "border-l-brand bg-[#FFF0DD]",
  warranty: "border-l-[#A93226] bg-[#F7E4E1]",
  crm: "border-l-ink bg-[#EDEDEA]",
  visit: "border-l-[#6A5ACD] bg-[#ECEBFA]",
};

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function StaffHome() {
  const profile = await requireRole(["technician", "superadmin"]);
  const supabase = await createClient();
  const today = dayKey(new Date());
  const from = startOfDay(today).toISOString();
  const to = startOfDay(addDays(today, 1)).toISOString();
  // Todo pasa por RLS: el técnico solo ve lo que le corresponde; el SUPERADMIN ve todo.
  const [tickets, crm, events, requests] = await Promise.all([
    supabase.from("tickets").select("id, code, status, received_at, customers(full_name), equipment(brand, model)").not("status", "in", "(delivered,cancelled)").order("received_at").limit(200),
    supabase.from("crm_tasks").select("id, task_type, due_at, customers(full_name)").in("status", ["pending", "contacted", "interested", "scheduled", "no_answer"]).lte("due_at", to).order("due_at").limit(50),
    supabase.from("calendar_events").select("id, event_type, title, starts_at, ticket_id").gte("starts_at", from).lt("starts_at", to).order("starts_at"),
    profile.role === "superadmin" ? supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "pending") : Promise.resolve({ count: 0 }),
  ]);
  const open = tickets.data ?? [];
  const count = (s: string) => open.filter((t) => t.status === s).length;
  const tasks = crm.data ?? [];
  const agenda = events.data ?? [];

  const actions = open
    .filter((t) => NEXT_ACTION[t.status])
    .sort((a, b) => NEXT_ACTION[a.status].weight - NEXT_ACTION[b.status].weight || +new Date(a.received_at) - +new Date(b.received_at))
    .slice(0, 8)
    .map((t) => {
      const c = one(t.customers as Rel<{ full_name: string }>);
      const e = one(t.equipment as Rel<{ brand: string; model: string }>);
      const a = NEXT_ACTION[t.status];
      return <ListRow key={t.id} href={`/b/tickets/${t.id}`} title={a.title} icon={a.icon} tone={a.tone} detail={[t.code, e ? `${e.brand} ${e.model}` : null, c?.full_name].filter(Boolean).join(" · ")} />;
    });
  const taskRows = tasks.slice(0, 4).map((t) => {
    const c = one(t.customers as Rel<{ full_name: string }>);
    return <ListRow key={t.id} href="/b/crm" title={`Contactar${c ? ` · ${c.full_name}` : ""}`} icon="crm" tone="warn" detail={`Seguimiento CRM · ${longDate(t.due_at)}`} />;
  });
  const reqRow = (requests as { count: number | null }).count ? (
    <ListRow key="req" href="/b/solicitudes" title={`Recibir solicitudes nuevas (${(requests as { count: number }).count})`} icon="inbox" tone="info" detail="Solicitudes de clientes por atender" />
  ) : null;
  const rows = [reqRow, ...actions, ...taskRows].filter(Boolean);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <p className="m-0 text-[14px] font-semibold text-muted">{longDate(new Date())}</p>
          <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">
            {greeting()}
            {profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
          </h1>
        </div>
        <div>
          <PrimaryLink href="/b/tickets/nuevo" icon="plus">
            Nuevo ticket
          </PrimaryLink>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="dark" icon="ticket" value={open.length} label="Tickets abiertos" href="/b/tickets" />
        <StatCard icon="quote" value={count("awaiting_approval")} label="Esperando aprobación" href="/b/tickets?estado=awaiting_approval" />
        <StatCard icon="shield" value={count("ready")} label="Listos para entregar" href="/b/tickets?estado=ready" />
        <StatCard icon="crm" value={tasks.length} label="Seguimientos para hoy" href="/b/crm" />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Section title="Requieren acción">
          {rows.length === 0 ? <p className="m-0 py-3 text-[15px] text-muted">Todo al día: no hay tickets ni seguimientos que requieran acción ahora.</p> : <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">{rows.map((r, i) => <li key={i}>{r}</li>)}</ul>}
        </Section>
        <Section title="Agenda de hoy" action={<TextLink href="/b/agenda">Ver agenda</TextLink>}>
          {agenda.length === 0 ? (
            <p className="m-0 py-3 text-[15px] text-muted">No hay eventos para hoy.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {agenda.map((e) => (
                <li key={e.id}>
                  <Link href={e.ticket_id ? `/b/tickets/${e.ticket_id}` : "/b/agenda"} className={`press flex min-h-12 items-center gap-3 rounded-[14px] border-l-4 px-3.5 py-2.5 text-[14px] font-extrabold text-ink no-underline ${EVENT_TONE[e.event_type] ?? EVENT_TONE.crm}`}>
                    <span className="flex-none text-[13px]">{timeLabel(e.starts_at)}</span>
                    <span className="truncate">{e.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </section>
  );
}
