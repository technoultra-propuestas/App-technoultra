import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageTitle } from "@/components/ui/layout";
import { priceText } from "@/lib/domain/catalog";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Solicitar un servicio", robots: { index: false } };

type Svc = {
  id: string;
  slug: string;
  name: string;
  kind: "technical" | "digital";
  short_description: string | null;
  price_mode: "fixed" | "from" | "quote";
  base_price: number | null;
  price_unit: string | null;
  category_id: string | null;
};

export default async function RequestCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole(["client"]);
  const tab = (await searchParams).tipo === "digital" ? "digital" : "technical";
  const supabase = await createClient();
  const [{ data: services }, { data: categories }] = await Promise.all([
    supabase
      .from("services")
      .select("id, slug, name, kind, short_description, price_mode, base_price, price_unit, category_id")
      .eq("kind", tab)
      .order("sort_order")
      .order("name"),
    supabase.from("service_categories").select("id, name").eq("kind", tab).order("sort_order"),
  ]);
  const list = (services ?? []) as Svc[];
  const groups = (categories ?? [])
    .map((c) => ({ ...c, items: list.filter((s) => s.category_id === c.id) }))
    .concat([
      {
        id: "none",
        name: "Otros",
        items: list.filter((s) => !s.category_id || !(categories ?? []).some((c) => c.id === s.category_id)),
      },
    ])
    .filter((g) => g.items.length > 0);

  const tabCls = (on: boolean) =>
    `flex min-h-12 flex-1 items-center justify-center rounded-[14px] px-4 text-[15px] font-extrabold no-underline ${on ? "bg-ink text-white" : "border border-line bg-white text-ink"}`;
  return (
    <section className="flex flex-col gap-6">
      <PageTitle
        title="Solicitar un servicio"
        subtitle="Elige lo que necesitas. Siempre te mostramos la cotización antes de hacer cualquier trabajo."
      />
      <div role="tablist" className="flex gap-2">
        <Link
          role="tab"
          aria-selected={tab === "technical"}
          href="/c/solicitar"
          className={tabCls(tab === "technical")}
        >
          Servicio técnico
        </Link>
        <Link
          role="tab"
          aria-selected={tab === "digital"}
          href="/c/solicitar?tipo=digital"
          className={tabCls(tab === "digital")}
        >
          Soluciones digitales
        </Link>
      </div>
      {groups.length === 0 ? (
        <EmptyState
          title="Estamos preparando el catálogo"
          text="Pronto verás aquí los servicios disponibles."
        />
      ) : (
        groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-3">
            <h2 className="m-0 text-[18px] font-extrabold">{g.name}</h2>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3 p-0">
              {g.items.map((s) => (
                <li key={s.id}>
                  <Link href={`/c/solicitar/${s.slug}`} className="block h-full no-underline">
                    <Card className="flex h-full flex-col gap-1.5">
                      <span className="text-[17px] font-extrabold text-ink">{s.name}</span>
                      {s.short_description ? (
                        <span className="text-[14px] leading-snug text-muted">{s.short_description}</span>
                      ) : null}
                      <span className="mt-auto pt-2 text-[15px] font-extrabold text-ink">{priceText(s)}</span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
