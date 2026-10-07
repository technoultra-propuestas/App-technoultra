import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, EQUIPMENT_LABEL, fmtDate, PageTitle } from "@/components/ui/layout";
import { ListRow, PrimaryLink } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis equipos", robots: { index: false } };

/** Lista de equipos del cliente con su próximo mantenimiento y cuántos servicios ha tenido cada uno. */
export default async function EquipmentPage() {
  await requireRole(["client"]);
  const supabase = await createClient();
  const [{ data }, { data: tickets }] = await Promise.all([
    supabase.from("equipment").select("id, type, brand, model, serial, next_maintenance_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
    supabase.from("tickets").select("equipment_id, status").not("equipment_id", "is", null).limit(500),
  ]);
  const rows = data ?? [];
  const services = new Map<string, number>();
  for (const t of tickets ?? []) if (t.equipment_id) services.set(t.equipment_id, (services.get(t.equipment_id) ?? 0) + 1);
  return (
    <section className="flex flex-col gap-5">
      <PageTitle title="Mis equipos" subtitle="Registra tus equipos para pedir servicios más rápido y llevar su historial y garantías." action={<PrimaryLink href="/c/equipos/nuevo" icon="plus">Agregar equipo</PrimaryLink>} />
      {rows.length === 0 ? (
        <EmptyState title="Aún no tienes equipos" text="Registra tu primer equipo: lo podrás elegir al solicitar un servicio." action={<PrimaryLink href="/c/equipos/nuevo" icon="plus">Agregar equipo</PrimaryLink>} />
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-card border border-line bg-white p-2 shadow-card">
          {rows.map((e) => {
            const n = services.get(e.id) ?? 0;
            const detail = [EQUIPMENT_LABEL[e.type] ?? e.type, e.serial ? `Serial ${e.serial}` : null, n ? `${n} ${n === 1 ? "servicio" : "servicios"}` : "Sin servicios todavía"].filter(Boolean).join(" · ");
            return (
              <li key={e.id}>
                <ListRow
                  href={`/c/equipos/${e.id}`}
                  title={`${e.brand} ${e.model}`}
                  detail={detail}
                  icon={e.type === "printer" ? "box" : "wrench"}
                  tone="neutral"
                  trailing={e.next_maintenance_at ? <span className="hidden flex-none rounded-full bg-info-soft px-3 py-1 text-[12px] font-extrabold text-info sm:inline">Mantenimiento {fmtDate(e.next_maintenance_at)}</span> : undefined}
                />
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/c/solicitar" className="flex min-h-11 w-fit items-center text-[14px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">Solicitar un servicio</Link>
    </section>
  );
}
