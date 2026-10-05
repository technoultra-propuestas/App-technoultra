import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageTitle } from "@/components/ui/layout";
import { priceText } from "@/lib/domain/catalog";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Solicitar un servicio", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RequestCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole(["client"]);
  const sp = await searchParams;
  const tab = sp.tipo === "digital" ? "digital" : "technical";
  // Búsqueda sin comodines ni separadores de la sintaxis de PostgREST; el filtrado real lo hace la base de datos.
  const q = (sp.q ?? "").replace(/[%_,()*\\]/g, " ").trim().slice(0, 60);
  const cat = sp.categoria && UUID.test(sp.categoria) ? sp.categoria : "";
  const supabase = await createClient();
  let query = supabase
    .from("services")
    .select("id, slug, name, kind, short_description, price_mode, base_price, price_unit, price_type_label, parts_extra, requires_diagnosis, estimated_time, category_id, subcategory_id")
    .eq("kind", tab);
  if (q) query = query.or(`name.ilike.%${q}%,short_description.ilike.%${q}%`);
  if (cat) query = query.eq("category_id", cat);
  const [{ data: services }, { data: categories }, { data: subs }] = await Promise.all([
    query.order("sort_order").order("name"),
    supabase.from("service_categories").select("id, name").eq("kind", tab).order("sort_order"),
    supabase.from("service_subcategories").select("id, name").order("sort_order"),
  ]);
  const list = services ?? [];
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
  const field = "h-12 rounded-[14px] border border-line bg-white px-4 text-[15px]";
  return (
    <section className="flex flex-col gap-6">
      <PageTitle
        title="Solicitar un servicio"
        subtitle="Elige lo que necesitas. Siempre te mostramos la cotización antes de hacer cualquier trabajo."
      />
      <div role="tablist" className="flex gap-2">
        <Link role="tab" aria-selected={tab === "technical"} href="/c/solicitar" className={tabCls(tab === "technical")}>
          Servicio técnico
        </Link>
        <Link role="tab" aria-selected={tab === "digital"} href="/c/solicitar?tipo=digital" className={tabCls(tab === "digital")}>
          Soluciones digitales
        </Link>
      </div>
      <form method="get" role="search" className="flex flex-wrap gap-2">
        {tab === "digital" ? <input type="hidden" name="tipo" value="digital" /> : null}
        <label className="flex-1 basis-60">
          <span className="sr-only">Buscar un servicio</span>
          <input name="q" type="search" defaultValue={q} maxLength={60} placeholder="Buscar: lento, SSD, impresora…" className={`${field} w-full`} />
        </label>
        <label>
          <span className="sr-only">Categoría</span>
          <select name="categoria" defaultValue={cat} className={field}>
            <option value="">Todas las categorías</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className="min-h-12 rounded-[14px] bg-brand px-5 text-[15px] font-extrabold text-ink">Buscar</button>
      </form>
      {groups.length === 0 ? (
        <EmptyState
          title={q || cat ? "No encontramos servicios con ese filtro" : "Estamos preparando el catálogo"}
          text={q || cat ? "Prueba con otra palabra o quita el filtro de categoría." : "Pronto verás aquí los servicios disponibles."}
        />
      ) : (
        groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-3">
            <h2 className="m-0 text-[18px] font-extrabold">{g.name}</h2>
            {[...new Set(g.items.map((s) => s.subcategory_id ?? ""))].map((subId) => (
              <div key={subId || "sin"} className="flex flex-col gap-2">
                {subId ? <h3 className="m-0 text-[14px] font-extrabold text-ink-2">{(subs ?? []).find((x) => x.id === subId)?.name}</h3> : null}
                <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3 p-0">
                  {g.items
                    .filter((s) => (s.subcategory_id ?? "") === subId)
                    .map((s) => (
                      <li key={s.id}>
                        <Link href={`/c/solicitar/${s.slug}`} className="block h-full no-underline">
                          <Card className="flex h-full flex-col gap-1.5">
                            <span className="text-[17px] font-extrabold text-ink">{s.name}</span>
                            {s.short_description ? <span className="text-[14px] leading-snug text-muted">{s.short_description}</span> : null}
                            <span className="mt-auto pt-2 text-[15px] font-extrabold text-ink">{priceText(s)}</span>
                            {s.requires_diagnosis || s.estimated_time ? (
                              <span className="text-[12px] font-bold text-muted">
                                {[s.requires_diagnosis ? "Requiere diagnóstico" : null, s.estimated_time].filter(Boolean).join(" · ")}
                              </span>
                            ) : null}
                          </Card>
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        ))
      )}
    </section>
  );
}
