import type { Metadata } from "next";
import { Card, EmptyState, fmtDateTime, MODALITY_LABEL, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { receiveRequestAction } from "../tickets/actions";

export const metadata: Metadata = { title: "Solicitudes", robots: { index: false } };

export default async function RequestsAdminPage() {
  await requireRole(["superadmin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_requests")
    .select("id, code, modality, problem_description, preferred_at, created_at, customers(full_name, phone), services(name), addresses(line1, city_name)")
    .in("status", ["pending", "scheduled"])
    .order("created_at");
  const rows = data ?? [];
  return (
    <section className="flex flex-col gap-6">
      <PageTitle title="Solicitudes por atender" subtitle="Al recibir el equipo (o iniciar el servicio) se crea el ticket y empieza el flujo oficial." />
      {rows.length === 0 ? (
        <EmptyState title="No hay solicitudes pendientes" />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((r) => {
            const c = r.customers as unknown as { full_name: string; phone: string | null } | null;
            const s = r.services as unknown as { name: string } | null;
            const a = r.addresses as unknown as { line1: string; city_name: string } | null;
            return (
              <li key={r.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[17px] font-extrabold">
                        {s?.name} · {c?.full_name}
                      </div>
                      <div className="text-[13px] font-semibold text-muted">
                        {r.code} · {MODALITY_LABEL[r.modality]}
                        {a ? ` · ${a.line1}, ${a.city_name}` : ""}
                        {r.preferred_at ? ` · Preferencia ${fmtDateTime(r.preferred_at)}` : ""}
                      </div>
                      <p className="m-0 mt-2 text-[15px] leading-normal">{r.problem_description}</p>
                    </div>
                    <form action={receiveRequestAction}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <button type="submit" className="min-h-12 rounded-2xl bg-brand px-5 text-[15px] font-extrabold text-ink">
                        Recibir y crear ticket
                      </button>
                    </form>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
