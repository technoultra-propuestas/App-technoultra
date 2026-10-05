import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DeleteServiceForm, ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Editar servicio", robots: { index: false } };

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const [{ data: svc }, { data: cats }, { data: subs }, { data: history }] = await Promise.all([
    supabase.from("services").select("*").eq("id", id.data).is("deleted_at", null).maybeSingle(),
    supabase.from("service_categories").select("id, name, kind").order("sort_order"),
    supabase.from("service_subcategories").select("id, name, category_id").order("sort_order"),
    supabase.from("audit_logs").select("id, action, at, actor_role").eq("entity_type", "services").eq("entity_id", id.data).order("at", { ascending: false }).limit(15),
  ]);
  if (!svc) notFound();
  return (
    <section className="mx-auto flex w-full max-w-[600px] flex-col gap-6">
      <PageTitle title={svc.name} />
      <ServiceForm values={svc} categories={cats ?? []} subcategories={subs ?? []} />
      <Card>
        <h2 className="m-0 mb-3 text-[19px] font-extrabold">Historial de cambios</h2>
        {(history ?? []).length === 0 ? (
          <p className="m-0 text-[14px] font-semibold text-ink-2">Aún no hay cambios registrados.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px] font-semibold">
            {history!.map((h) => (
              <li key={h.id}>
                {new Date(h.at).toLocaleString("es-CO")} · {h.action} · {h.actor_role ?? "sistema"}
              </li>
            ))}
          </ul>
        )}
        <Link href="/b/servicios" className="mt-3 inline-block text-[14px] font-bold">
          Volver al catálogo
        </Link>
      </Card>
      <Card>
        <h2 className="m-0 mb-3 text-[19px] font-extrabold">Eliminar</h2>
        <DeleteServiceForm id={svc.id} />
      </Card>
    </section>
  );
}
