import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/layout";
import { NavIcon } from "@/components/ui/icons";
import { addDays, bogotaParts, dayKey, isDayKey, startOfDay, timeLabel, weekStart } from "@/lib/domain/agenda";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "./event-form";

export const metadata: Metadata = { title: "Agenda", robots: { index: false } };

const TYPE: Record<string, { label: string; dot: string; block: string }> = {
  reception: { label: "Recepción", dot: "#4F6EA8", block: "border-l-[#4F6EA8] bg-[#EEF1F6]" },
  diagnosis: { label: "Diagnóstico", dot: "#C9961A", block: "border-l-[#C9961A] bg-[#FBF1D9]" },
  delivery: { label: "Entrega", dot: "#2E8B57", block: "border-l-[#2E8B57] bg-[#E3F3E8]" },
  maintenance: { label: "Mantenimiento", dot: "#FF8A00", block: "border-l-brand bg-[#FFF0DD]" },
  warranty: { label: "Garantía", dot: "#A93226", block: "border-l-[#A93226] bg-[#F7E4E1]" },
  crm: { label: "CRM", dot: "#121212", block: "border-l-ink bg-[#EDEDEA]" },
  visit: { label: "Visita a domicilio", dot: "#6A5ACD", block: "border-l-[#6A5ACD] bg-[#ECEBFA]" },
};
const VIEWS = [
  ["dia", "Día"],
  ["semana", "Semana"],
  ["mes", "Mes"],
] as const;
type View = (typeof VIEWS)[number][0];

const H0 = 7; // la rejilla semanal va de 7 a. m. a 7 p. m. (como el mockup)
const H1 = 19;
const ROW = 56; // px por hora
const WD = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

type Ev = { id: string; event_type: string; title: string; starts_at: string; duration_minutes: number; ticket_id: string | null; customers: { full_name: string } | { full_name: string }[] | null };

const custName = (e: Ev) => (Array.isArray(e.customers) ? e.customers[0]?.full_name : e.customers?.full_name);
const monthFirst = (key: string) => key.slice(0, 8) + "01";
const addMonths = (key: string, n: number) => {
  const [y, m] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01`;
};
const fmtShort = (key: string) => startOfDay(key).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" }).replace(".", "");
const fmtLong = (key: string) => {
  const s = startOfDay(key).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const fmtMonth = (key: string) => {
  const s = startOfDay(key).toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "America/Bogota" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "a. m." : "p. m."}`;

export default async function AgendaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(["technician", "superadmin"]);
  const sp = await searchParams;
  const today = dayKey(new Date());
  const view: View = VIEWS.some(([k]) => k === sp.vista) ? (sp.vista as View) : "semana";
  const date = isDayKey(sp.fecha) ? sp.fecha : today;

  let from: string;
  let days: number;
  let title: string;
  let prev: string;
  let next: string;
  if (view === "dia") {
    from = date;
    days = 1;
    title = fmtLong(date);
    prev = addDays(date, -1);
    next = addDays(date, 1);
  } else if (view === "semana") {
    from = weekStart(date);
    days = 7;
    title = `${fmtShort(from)} – ${fmtShort(addDays(from, 6))}`;
    prev = addDays(date, -7);
    next = addDays(date, 7);
  } else {
    from = weekStart(monthFirst(date));
    days = 42;
    title = fmtMonth(date);
    prev = addMonths(date, -1);
    next = addMonths(date, 1);
  }
  const range = { from: startOfDay(from).toISOString(), to: startOfDay(addDays(from, days)).toISOString() };

  const supabase = await createClient();
  const [{ data }, staffRes] = await Promise.all([
    // RLS: el técnico solo ve los eventos que le corresponden; el SUPERADMIN, todos.
    supabase.from("calendar_events").select("id, event_type, title, starts_at, duration_minutes, ticket_id, customers(full_name)").gte("starts_at", range.from).lt("starts_at", range.to).order("starts_at"),
    profile.role === "superadmin"
      ? supabase.from("profiles").select("id, full_name, email").in("role", ["technician", "superadmin"]).eq("is_active", true).order("full_name")
      : Promise.resolve({ data: [] as { id: string; full_name: string; email: string }[] }),
  ]);
  const events = (data ?? []) as unknown as Ev[];
  const byDay = new Map<string, Ev[]>();
  for (const e of events) byDay.set(dayKey(e.starts_at), [...(byDay.get(dayKey(e.starts_at)) ?? []), e]);
  const href = (v: View, d: string) => `/b/agenda?vista=${v}&fecha=${d}`;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em] lg:text-[30px]">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            <Link href={href(view, prev)} aria-label="Anterior" className="press flex h-11 w-11 items-center justify-center rounded-[14px] border border-line bg-white shadow-card">
              <NavIcon name="chevron" width={18} height={18} className="rotate-180" />
            </Link>
            <Link href={href(view, today)} className="press flex h-11 items-center rounded-[14px] border border-line bg-white px-4 text-[14px] font-extrabold text-ink no-underline shadow-card">
              Hoy
            </Link>
            <Link href={href(view, next)} aria-label="Siguiente" className="press flex h-11 w-11 items-center justify-center rounded-[14px] border border-line bg-white shadow-card">
              <NavIcon name="chevron" width={18} height={18} />
            </Link>
          </div>
          <div role="group" aria-label="Vista" className="flex rounded-[14px] border border-line bg-white p-1 shadow-card">
            {VIEWS.map(([k, l]) => (
              <Link key={k} href={href(k, date)} aria-current={view === k ? "true" : undefined} className={`press flex min-h-9 items-center rounded-[10px] px-3.5 text-[14px] font-extrabold no-underline ${view === k ? "bg-ink text-white" : "text-ink"}`}>
                {l}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <ul aria-label="Leyenda" className="m-0 flex list-none flex-wrap gap-2 p-0">
        {Object.values(TYPE).map((t) => (
          <li key={t.label} className="flex items-center gap-2 rounded-chip border border-line bg-white px-3 py-1.5 text-[13px] font-extrabold">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: t.dot }} />
            {t.label}
          </li>
        ))}
      </ul>

      {view === "dia" ? <DayList events={events} /> : view === "semana" ? <WeekGrid from={from} byDay={byDay} today={today} /> : <MonthGrid from={from} month={date.slice(0, 7)} byDay={byDay} today={today} href={href} />}

      {profile.role === "superadmin" ? (
        <details className="rounded-card border border-line bg-white p-5 shadow-card">
          <summary className="cursor-pointer text-[17px] font-extrabold">Nuevo evento</summary>
          <div className="pt-4">
            <EventForm staff={(staffRes.data ?? []).map((s) => ({ id: s.id, name: s.full_name || s.email }))} />
          </div>
        </details>
      ) : null}
    </section>
  );
}

function EventLink({ e, className, children }: { e: Ev; className: string; children: React.ReactNode }) {
  return e.ticket_id ? (
    <Link href={`/b/tickets/${e.ticket_id}`} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

function DayList({ events }: { events: Ev[] }) {
  if (events.length === 0) return <EmptyState title="No hay eventos este día" text="Elige otra fecha o cambia a la vista semanal." />;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 rounded-card border border-line bg-white p-3 shadow-card">
      {events.map((e) => {
        const t = TYPE[e.event_type] ?? TYPE.crm;
        const c = custName(e);
        return (
          <li key={e.id}>
            <EventLink e={e} className={`press flex min-h-[64px] items-center gap-4 rounded-[14px] border-l-4 px-4 py-2.5 text-ink no-underline ${t.block}`}>
              <span className="w-[76px] flex-none text-[14px] font-extrabold">{timeLabel(e.starts_at)}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-extrabold">{e.title}</span>
                <span className="truncate text-[13px] font-semibold text-ink-2">
                  {t.label} · {e.duration_minutes} min{c ? ` · ${c}` : ""}
                </span>
              </span>
              {e.ticket_id ? <NavIcon name="chevron" width={18} height={18} aria-hidden /> : null}
            </EventLink>
          </li>
        );
      })}
    </ul>
  );
}

/** Rejilla semanal: eventos posicionados por hora; los que se cruzan se reparten en carriles. */
function WeekGrid({ from, byDay, today }: { from: string; byDay: Map<string, Ev[]>; today: string }) {
  const hours = Array.from({ length: H1 - H0 }, (_, i) => H0 + i);
  const cols = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
      <div className="grid min-w-[760px] grid-cols-[56px_repeat(7,minmax(0,1fr))]">
        <div />
        {cols.map((k, i) => (
          <div key={k} className="px-2 pb-2 pt-3">
            <div className={`text-[11px] font-extrabold ${k === today ? "text-brand" : "text-muted"}`}>{WD[i]}</div>
            <div className={`mt-0.5 inline-flex min-w-9 items-center justify-center rounded-[10px] px-1.5 py-1 text-[20px] font-extrabold leading-none ${k === today ? "bg-brand text-ink" : ""}`}>{Number(k.slice(8))}</div>
          </div>
        ))}
        <div className="relative">
          {hours.map((h) => (
            <div key={h} style={{ height: ROW }} className="pr-2 pt-1 text-right text-[11px] font-bold text-muted">
              {hourLabel(h)}
            </div>
          ))}
        </div>
        {cols.map((k) => (
          <DayColumn key={k} events={byDay.get(k) ?? []} today={k === today} />
        ))}
      </div>
    </div>
  );
}

function DayColumn({ events, today }: { events: Ev[]; today: boolean }) {
  const placed = layout(events);
  return (
    <div className={`relative border-l border-line ${today ? "bg-[#FFFAF2]" : ""}`} style={{ height: (H1 - H0) * ROW }}>
      {Array.from({ length: H1 - H0 }, (_, i) => (
        <div key={i} className="border-b border-line" style={{ height: ROW }} />
      ))}
      {placed.map(({ e, top, height, lane, lanes }) => {
        const t = TYPE[e.event_type] ?? TYPE.crm;
        const c = custName(e);
        return (
          <div key={e.id} className="absolute px-[3px]" style={{ top, height, left: `${(lane / lanes) * 100}%`, width: `${100 / lanes}%` }}>
            <EventLink e={e} className={`block h-full overflow-hidden rounded-[10px] border-l-4 px-2 py-1 text-[12px] font-extrabold leading-tight text-ink no-underline ${t.block}`}>
              <span className="sr-only">{t.label}: </span>
              <span className="block">{timeLabel(e.starts_at)}</span>
              <span className="block truncate font-bold">{e.title}</span>
              {c && height > 54 ? <span className="block truncate font-semibold text-ink-2">{c}</span> : null}
            </EventLink>
          </div>
        );
      })}
    </div>
  );
}

/** Posición vertical por hora/duración y carriles para eventos que se solapan (algoritmo voraz). */
function layout(events: Ev[]) {
  const items = events
    .map((e) => {
      const p = bogotaParts(e.starts_at);
      const start = Math.min(Math.max(p.h + p.min / 60, H0), H1 - 0.5);
      const end = Math.min(start + Math.max(e.duration_minutes, 30) / 60, H1);
      return { e, start, end, top: (start - H0) * ROW, height: Math.max((end - start) * ROW - 2, 28), lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.start - b.start);
  let group: typeof items = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = group.reduce((m, x) => Math.max(m, x.lane + 1), 1);
    for (const x of group) x.lanes = lanes;
    group = [];
  };
  for (const it of items) {
    if (it.start >= groupEnd) flush();
    const used = new Set(group.filter((g) => g.end > it.start).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    it.lane = lane;
    group.push(it);
    groupEnd = Math.max(groupEnd, it.end);
  }
  flush();
  return items;
}

function MonthGrid({ from, month, byDay, today, href }: { from: string; month: string; byDay: Map<string, Ev[]>; today: string; href: (v: View, d: string) => string }) {
  const cells = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
      <div className="grid min-w-[640px] grid-cols-7">
        {WD.map((d) => (
          <div key={d} className="border-b border-line px-2 py-2 text-[11px] font-extrabold text-muted">
            {d}
          </div>
        ))}
        {cells.map((k) => {
          const list = byDay.get(k) ?? [];
          const inMonth = k.startsWith(month);
          return (
            <Link key={k} href={href("dia", k)} aria-label={`${fmtLong(k)}${list.length ? `, ${list.length} eventos` : ""}`} className={`press flex min-h-[104px] flex-col gap-1 border-b border-l border-line p-1.5 text-ink no-underline ${inMonth ? "" : "bg-paper/70 text-muted"}`}>
              <span className={`inline-flex h-7 min-w-7 items-center justify-center self-start rounded-[9px] px-1 text-[13px] font-extrabold ${k === today ? "bg-brand text-ink" : ""}`}>{Number(k.slice(8))}</span>
              {list.slice(0, 3).map((e) => {
                const t = TYPE[e.event_type] ?? TYPE.crm;
                return (
                  <span key={e.id} className={`truncate rounded-[7px] border-l-[3px] px-1.5 py-0.5 text-[11px] font-bold ${t.block}`}>
                    {timeLabel(e.starts_at)} {e.title}
                  </span>
                );
              })}
              {list.length > 3 ? <span className="px-1 text-[11px] font-extrabold text-muted">+{list.length - 3} más</span> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
