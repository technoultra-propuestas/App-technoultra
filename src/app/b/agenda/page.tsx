import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "./event-form";

export const metadata: Metadata = { title: "Agenda", robots: { index: false } };

const TYPE: Record<string, { label: string; cls: string }> = {
  reception: { label: "Recepción", cls: "bg-[#EEF1F6] text-[#33507A]" },
  diagnosis: { label: "Diagnóstico", cls: "bg-[#FBF1D9] text-[#6E4B00]" },
  delivery: { label: "Entrega", cls: "bg-[#E3F3E8] text-[#1F6B3A]" },
  maintenance: { label: "Mantenimiento", cls: "bg-[#FFF0DD] text-[#7A3E00]" },
  warranty: { label: "Garantía", cls: "bg-[#F7E4E1] text-[#9A2B1E]" },
  crm: { label: "CRM", cls: "bg-[#EDEDEA] text-ink-2" },
  visit: { label: "Visita", cls: "bg-[#ECEBFA] text-[#3F3A8C]" },
};
const dayKey = (d: string) => new Date(d).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" });
const hour = (d: string) => new Date(d).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });

/** Ventana de la agenda: desde ayer hasta 45 días. Fuera del componente porque depende de la hora actual. */
function agendaWindow() {
  const now = Date.now();
  return { from: new Date(now - 24 * 3600_000).toISOString(), to: new Date(now + 45 * 24 * 3600_000).toISOString() };
}

export default async function AgendaPage() {
  const profile = await requireRole(["technician", "superadmin"]);
  const supabase = await createClient();
  const { from, to } = agendaWindow();
  const [{ data }, staffRes] = await Promise.all([
    supabase.from("calendar_events").select("id, event_type, title, starts_at, duration_minutes, ticket_id, customers(full_name)").gte("starts_at", from).lte("starts_at", to).order("starts_at"),
    profile.role === "superadmin" ? supabase.from("profiles").select("id, full_name, email").in("role", ["technician", "superadmin"]).eq("is_active", true).order("full_name") : Promise.resolve({ data: [] as { id: string; full_name: string; email: string }[] }),
  ]);
  const events = data ?? [];
  const groups = new Map<string, typeof events>();
  for (const e of events) groups.set(dayKey(e.starts_at), [...(groups.get(dayKey(e.starts_at)) ?? []), e]);
  return (
    <section className="flex flex-col gap-6">
      <PageTitle title="Agenda" subtitle="Recogidas, visitas, entregas y mantenimientos de los próximos 45 días." />
      <div className={`grid gap-6 ${profile.role === "superadmin" ? "md:grid-cols-[1fr_340px]" : ""}`}>
        {events.length === 0 ? (
          <EmptyState title="No hay eventos programados" />
        ) : (
          <div className="flex flex-col gap-5">
            {[...groups.entries()].map(([day, list]) => (
              <div key={day} className="flex flex-col gap-2">
                <h2 className="m-0 text-[16px] font-extrabold capitalize">{day}</h2>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {list.map((e) => {
                    const t = TYPE[e.event_type];
                    const c = e.customers as unknown as { full_name: string } | null;
                    const body = (
                      <Card className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-extrabold text-ink">{e.title}</div>
                          <div className="text-[13px] font-semibold text-muted">
                            {hour(e.starts_at)} · {e.duration_minutes} min{c ? ` · ${c.full_name}` : ""}
                          </div>
                        </div>
                        <span className={`flex-none rounded-full px-3 py-1 text-[12px] font-extrabold ${t.cls}`}>{t.label}</span>
                      </Card>
                    );
                    return (
                      <li key={e.id}>
                        {e.ticket_id ? (
                          <Link href={`/b/tickets/${e.ticket_id}`} className="block no-underline">
                            {body}
                          </Link>
                        ) : (
                          body
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
        {profile.role === "superadmin" ? (
          <Card className="h-fit">
            <h2 className="m-0 mb-4 text-[19px] font-extrabold">Nuevo evento</h2>
            <EventForm staff={(staffRes.data ?? []).map((s) => ({ id: s.id, name: s.full_name || s.email }))} />
          </Card>
        ) : null}
      </div>
    </section>
  );
}
