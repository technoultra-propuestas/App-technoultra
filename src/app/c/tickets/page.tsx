import type { Metadata } from "next";
import Link from "next/link";
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
        <div className="flex flex-col gap-3">
          <h2 className="m-0 text-[18px] font-extrabold">Solicitudes por atender</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {r.map((x) => (
              <li key={x.id}>
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[16px] font-extrabold">
                      {(x.services as unknown as { name: string } | null)?.name ?? "Servicio"}
                    </div>
                    <div className="truncate text-[13px] font-semibold text-muted">
                      {x.code} · {MODALITY_LABEL[x.modality]} · {fmtDate(x.created_at)}
                    </div>
                  </div>
                  <StatusBadge status={x.status} />
                </Card>
              </li>
            ))}
          </ul>
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
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {t.map((x) => (
            <li key={x.id}>
              <Link href={`/c/tickets/${x.id}`} className="block no-underline">
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[16px] font-extrabold text-ink">{x.code}</div>
                    <div className="truncate text-[13px] font-semibold text-muted">{x.problem}</div>
                  </div>
                  <StatusBadge status={x.status} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
