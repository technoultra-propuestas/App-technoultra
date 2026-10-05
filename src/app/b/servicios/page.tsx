import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { priceText } from "@/lib/domain/catalog";
import { createClient } from "@/lib/supabase/server";
import { CategoryForm } from "./service-form";

export const metadata: Metadata = { title: "Catálogo de servicios", robots: { index: false } };

export default async function ServicesAdminPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("id, name, kind, price_mode, base_price, price_unit, price_type_label, parts_extra, is_active, allowed_modalities")
    .is("deleted_at", null)
    .order("kind")
    .order("sort_order")
    .order("name");
  const list = data ?? [];
  return (
    <section className="flex flex-col gap-6">
      <PageTitle title="Catálogo de servicios" subtitle="Los precios que ves aquí son los que usa toda la app. Nada está fijo en el código." action={<LinkButton href="/b/servicios/nuevo">Nuevo servicio</LinkButton>} />
      <div className="grid gap-6 md:grid-cols-[1fr_340px]">
        {list.length === 0 ? (
          <EmptyState title="Aún no hay servicios" text="Crea el primero para que los clientes puedan solicitarlo." action={<LinkButton href="/b/servicios/nuevo">Nuevo servicio</LinkButton>} />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {list.map((s) => (
              <li key={s.id}>
                <Link href={`/b/servicios/${s.id}`} className="block no-underline">
                  <Card className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[16px] font-extrabold text-ink">{s.name}</div>
                      <div className="truncate text-[13px] font-semibold text-muted">
                        {s.kind === "digital" ? "Digital" : "Técnico"} · {priceText(s)} · {s.allowed_modalities.join(", ")}
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[12px] font-extrabold ${s.is_active ? "bg-[#E3F3E8] text-[#1F6B3A]" : "bg-[#EDEDEA] text-ink-2"}`}>{s.is_active ? "Activo" : "Oculto"}</span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Card className="h-fit">
          <h2 className="m-0 mb-4 text-[19px] font-extrabold">Nueva categoría</h2>
          <CategoryForm />
        </Card>
      </div>
    </section>
  );
}
