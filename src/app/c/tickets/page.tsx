import type { Metadata } from "next";
import { ListRow } from "@/components/ui/kit";
import {
  Card,
  EmptyState,
  fmtDate,
  LinkButton,
  MODALITY_LABEL,
  PageTitle,
  StatusBadge,
} from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis servicios", robots: { index: false } };

export default async function TicketsPage() {
  await requireRole(["client"]);
  const supabase = await createClient();
  const [{ data: tickets }, { data: requests }] = await Promise.all([
    supabase
      .from("tickets")
      .select("id, code, status, modality, problem, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("service_requests")
      .select("id, code, status, modality, problem_description, created_at, services(name)")
      .in("status", ["pending", "scheduled"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const t = tickets ?? [];
  const r = requests ?? [];
  return (
    <section className="flex flex-col gap-6">
      <PageTitle
        title="Mis servicios"
        action={<LinkButton href="/c/solicitar">Solicitar servicio</LinkButton>}
      />
      {r.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-[18px] font-extrabold">Solicitudes por atender</h2>
          <Card className="flex flex-col p-2">
            {r.map((x) => (
              <div key={x.id} className="flex min-h-[64px] items-center justify-between gap-3 px-2 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-extrabold">{(x.services as unknown as { name: string } | null)?.name ?? "Servicio"}</div>
                  <div className="truncate text-[13px] font-semibold text-muted">
                    {x.code} · {MODALITY_LABEL[x.modality]} · {fmtDate(x.created_at)}
                  </div>
                </div>
                <StatusBadge status={x.status} />
              </div>
            ))}
          </Card>
        </div>
      ) : null}
      {t.length === 0 && r.length === 0 ? (
        <EmptyState
          title="Todavía no tienes servicios"
          text="Cuando solicites uno, aquí verás cada avance."
          action={<LinkButton href="/c/solicitar">Solicitar servicio</LinkButton>}
        />
      ) : null}
      {t.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-[18px] font-extrabold">Tus servicios</h2>
          <Card className="flex flex-col p-2">
            {t.map((x) => (
              <ListRow key={x.id} href={`/c/tickets/${x.id}`} icon="ticket" title={x.code} detail={`${x.problem} · ${fmtDate(x.created_at)}`} trailing={<StatusBadge status={x.status} />} />
            ))}
          </Card>
        </div>
      ) : null}
    </section>
  );
}
