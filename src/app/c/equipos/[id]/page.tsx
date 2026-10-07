import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { InfoList, Panel, Timeline } from "@/components/ui/detail";
import { EQUIPMENT_LABEL, fmtDate, StatusBadge } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { archiveEquipmentAction } from "../actions";
import { EquipmentForm } from "../equipment-form";

export const metadata: Metadata = { title: "Equipo", robots: { index: false } };

export default async function EquipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["client"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  // RLS: un id ajeno devuelve 0 filas → 404 (no revela si existe).
  const { data: eq } = await supabase.from("equipment").select("*").eq("id", id.data).is("deleted_at", null).maybeSingle();
  if (!eq) notFound();
  const [{ data: tickets }, { data: history }, { data: warranties }] = await Promise.all([
    supabase.from("tickets").select("id, code, status, created_at").eq("equipment_id", eq.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("equipment_history").select("id, event_type, created_at").eq("equipment_id", eq.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("warranties").select("id, code, description, end_date, status").eq("equipment_id", eq.id).order("end_date", { ascending: false }).limit(10),
  ]);
  return (
    <section className="flex flex-col gap-5">
      <TextLink href="/c/equipos" className="w-fit">← Mis equipos</TextLink>
      <header className="flex flex-col gap-1 rounded-card bg-ink p-5 text-white shadow-card sm:p-6">
        <span className="text-[12px] font-extrabold uppercase tracking-[0.05em] text-[#B9B9B4]">{EQUIPMENT_LABEL[eq.type] ?? eq.type}</span>
        <h1 className="m-0 text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-brand">{eq.brand} {eq.model}</h1>
        <p className="m-0 text-[14px] font-semibold text-[#D6D6D2]">{[eq.serial ? `Serial ${eq.serial}` : null, eq.year ? `Año ${eq.year}` : null, eq.ram, eq.storage].filter(Boolean).join(" · ") || "Sin más datos registrados"}</p>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="flex flex-col gap-5">
          <Panel title="Datos del equipo" hint="Mantén estos datos al día: ayudan al técnico a revisar más rápido.">
            <EquipmentForm values={eq} />
          </Panel>
          <form action={archiveEquipmentAction}>
            <input type="hidden" name="id" value={eq.id} />
            <button type="submit" className="min-h-11 rounded-ctl border border-line-strong bg-white px-4 text-[14px] font-extrabold text-danger">Quitar de mi lista</button>
          </form>
        </div>
        <aside className="flex flex-col gap-5">
          <Panel title="Servicios de este equipo">
            {(tickets ?? []).length === 0 ? (
              <p className="m-0 text-[14px] text-muted">Todavía no tiene servicios.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
                {(tickets ?? []).map((t) => (
                  <li key={t.id} className="flex min-h-12 items-center justify-between gap-2">
                    <Link href={`/c/tickets/${t.id}`} className="text-[14.5px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">{t.code}</Link>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
            <Link href="/c/solicitar" className="flex min-h-11 w-fit items-center text-[14px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">Solicitar un servicio</Link>
          </Panel>
          {(warranties ?? []).length > 0 ? (
            <Panel title="Garantías">
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {(warranties ?? []).map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-3 text-[14px] font-semibold">
                    <span className="min-w-0 truncate">{w.description}</span>
                    <span className="flex-none text-muted">{w.status === "active" ? "hasta" : "venció"} {fmtDate(w.end_date)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {eq.next_maintenance_at ? (
            <Panel title="Próximo mantenimiento recomendado">
              <InfoList rows={[{ label: "Fecha sugerida", value: fmtDate(eq.next_maintenance_at) }]} />
            </Panel>
          ) : null}
          {(history ?? []).length > 0 ? (
            <Panel title="Historial">
              <Timeline items={(history ?? []).map((h) => ({ id: h.id, title: h.event_type === "delivered" ? "Entregado tras servicio" : h.event_type, at: h.created_at }))} />
            </Panel>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
