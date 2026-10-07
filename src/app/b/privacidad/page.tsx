import type { Metadata } from "next";
import { Card, EmptyState, PageTitle } from "@/components/ui/layout";
import { SearchField } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { anonymizeCustomerAction } from "./actions";

export const metadata: Metadata = { title: "Privacidad y datos personales", robots: { index: false } };

/** Solicitudes de supresión (Ley 1581). Solo administración; la base de datos vuelve a validar el rol. */
export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRole(["superadmin"]);
  const q = ((await searchParams).q ?? "").replace(/[%_,()*\\]/g, " ").trim().slice(0, 60);
  let rows: { id: string; full_name: string; email: string | null; phone: string | null }[] = [];
  if (q.length >= 3) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("customers")
      .select("id, full_name, email, phone")
      .is("deleted_at", null)
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(10);
    rows = data ?? [];
  }
  return (
    <section className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
      <PageTitle
        title="Privacidad y datos personales"
        subtitle="Atiende solicitudes de supresión (Ley 1581). Se borran los datos de contacto; el historial de servicios, pagos y documentos se conserva sin datos personales por obligación legal."
      />
      <SearchField placeholder="Nombre, correo o celular (mín. 3 letras)" defaultValue={q} />
      {q.length >= 3 && rows.length === 0 ? <EmptyState title="Sin resultados" text="No hay clientes activos con ese dato." /> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {rows.map((c) => (
          <li key={c.id}>
            <Card className="flex flex-col gap-3">
              <div>
                <div className="text-[16px] font-extrabold">{c.full_name}</div>
                <div className="text-[13px] font-semibold text-muted">{[c.email, c.phone].filter(Boolean).join(" · ") || "Sin contacto"}</div>
              </div>
              <form action={anonymizeCustomerAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={c.id} />
                <label className="flex flex-col gap-1 text-[13px] font-bold">
                  Escribe ANONIMIZAR para confirmar (no se puede deshacer)
                  <input name="confirm" required pattern="ANONIMIZAR" autoComplete="off" className="h-11 rounded-xl border border-line px-3 text-[15px]" />
                </label>
                <button className="min-h-11 rounded-xl bg-[#9A2B1E] px-4 text-[14px] font-extrabold text-white">Anonimizar</button>
              </form>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
