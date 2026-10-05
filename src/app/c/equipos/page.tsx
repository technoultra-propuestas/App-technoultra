import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, EQUIPMENT_LABEL, LinkButton, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis equipos", robots: { index: false } };

export default async function EquipmentPage() {
  await requireRole(["client"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("equipment")
    .select("id, type, brand, model, serial, next_maintenance_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = data ?? [];
  return (
    <section className="flex flex-col gap-6">
      <PageTitle
        title="Mis equipos"
        action={<LinkButton href="/c/equipos/nuevo">Agregar equipo</LinkButton>}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Aún no tienes equipos"
          text="Registra tu primer equipo para pedir servicios más rápido."
          action={<LinkButton href="/c/equipos/nuevo">Agregar equipo</LinkButton>}
        />
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3 p-0">
          {rows.map((e) => (
            <li key={e.id}>
              <Link href={`/c/equipos/${e.id}`} className="block no-underline">
                <Card className="flex flex-col gap-1">
                  <span className="text-[13px] font-bold tracking-[0.04em] text-muted">
                    {EQUIPMENT_LABEL[e.type] ?? e.type}
                  </span>
                  <span className="text-[18px] font-extrabold text-ink">
                    {e.brand} {e.model}
                  </span>
                  {e.serial ? (
                    <span className="text-[13px] font-semibold text-muted">Serial {e.serial}</span>
                  ) : null}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
