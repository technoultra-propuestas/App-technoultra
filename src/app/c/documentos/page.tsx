import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, fmtDate, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis documentos", robots: { index: false } };

const STATUS: Record<string, string> = { generated: "Por revisar", sent: "Enviado", viewed: "Visto", signed: "Firmado", rejected: "Rechazado", superseded: "Reemplazado" };

export default async function ClientDocumentsPage() {
  await requireRole(["client"]);
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("id, code, title, version, status, created_at").order("created_at", { ascending: false }).limit(100);
  const docs = data ?? [];
  return (
    <section className="flex flex-col gap-6">
      <PageTitle title="Mis documentos" subtitle="Actas, cotizaciones, garantías y recomendaciones de tus servicios." />
      {docs.length === 0 ? (
        <EmptyState title="Aún no tienes documentos" text="Cuando recibamos tu equipo y avancemos con el servicio, los verás aquí." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {docs.map((d) => (
            <li key={d.id}>
              <Link href={`/c/documentos/${d.id}`} className="block no-underline">
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[16px] font-extrabold text-ink">
                      {d.title} · v{d.version}
                    </div>
                    <div className="truncate text-[13px] font-semibold text-muted">
                      {d.code} · {fmtDate(d.created_at)}
                    </div>
                  </div>
                  <span className="flex-none rounded-full bg-[#EDEDEA] px-3 py-1 text-[12px] font-extrabold">{STATUS[d.status] ?? d.status}</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
