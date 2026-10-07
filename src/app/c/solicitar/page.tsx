import type { Metadata } from "next";
import Link from "next/link";
import { ChipRow, FilterChip, SearchField, SegmentTabs } from "@/components/ui/kit";
import { EmptyState } from "@/components/ui/layout";
import { priceText } from "@/lib/domain/catalog";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Solicitar un servicio", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Catálogo de servicios del cliente: pestañas, búsqueda y categorías en una línea; filas compactas con el precio visible. */
export default async function RequestCatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
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
    .concat([{ id: "none", name: "Otros", items: list.filter((s) => !s.category_id || !(categories ?? []).some((c) => c.id === s.category_id)) }])
    .filter((g) => g.items.length > 0);
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ tipo: tab === "digital" ? "digital" : undefined, q: q || undefined, categoria: cat || undefined, ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return `/c/solicitar${s ? `?${s}` : ""}`;
  };

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em] lg:text-[30px]">Solicitar un servicio</h1>
        <div className="mt-2 h-1 w-10 rounded-sm bg-brand" />
        <p className="m-0 mt-2 max-w-[640px] text-[15px] leading-normal text-muted">Siempre te mostramos el precio o la cotización antes de cobrar o hacer cualquier trabajo.</p>
      </div>
      <Link href="/c/asistente" className="press flex min-h-14 items-center justify-between gap-3 rounded-card border border-brand bg-white px-5 py-3 text-ink no-underline shadow-card">
        <span className="flex min-w-0 flex-col">
          <span className="text-[15px] font-extrabold">¿No sabes qué servicio necesitas?</span>
          <span className="text-[13px] font-semibold text-muted">Cuéntaselo al asistente y te sugiere opciones.</span>
        </span>
        <span className="flex-none text-[13px] font-extrabold text-brand">Abrir</span>
      </Link>
      <SegmentTabs label="Tipo de servicio" active={tab} items={[{ key: "technical", label: "Servicio técnico", href: "/c/solicitar" }, { key: "digital", label: "Soluciones digitales", href: "/c/solicitar?tipo=digital" }]} />
      <SearchField placeholder="Buscar: lento, SSD, impresora…" defaultValue={q} keep={{ tipo: tab === "digital" ? "digital" : undefined, categoria: cat || undefined }} />
      {(categories ?? []).length > 1 ? (
        <ChipRow label="Categorías">
          <FilterChip href={href({ categoria: undefined })} on={!cat}>Todas</FilterChip>
          {(categories ?? []).map((c) => (
            <FilterChip key={c.id} href={href({ categoria: c.id })} on={cat === c.id}>{c.name}</FilterChip>
          ))}
        </ChipRow>
      ) : null}
      {groups.length === 0 ? (
        <EmptyState title={q || cat ? "No encontramos servicios con ese filtro" : "Estamos preparando el catálogo"} text={q || cat ? "Prueba con otra palabra o quita el filtro de categoría." : "Pronto verás aquí los servicios disponibles."} />
      ) : (
        groups.map((g) => (
          <section key={g.id} aria-label={g.name} className="flex flex-col gap-2">
            <h2 className="m-0 text-[17px] font-extrabold">{g.name}</h2>
            <ul className="m-0 flex list-none flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-white p-0 shadow-card">
              {g.items.map((s) => {
                const sub = (subs ?? []).find((x) => x.id === s.subcategory_id)?.name;
                const meta = [sub, s.requires_diagnosis ? "Requiere diagnóstico" : null, s.estimated_time].filter(Boolean).join(" · ");
                return (
                  <li key={s.id}>
                    <Link href={`/c/solicitar/${s.slug}`} className="press flex min-h-[72px] items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-paper">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[15.5px] font-extrabold leading-snug">{s.name}</span>
                        {s.short_description ? <span className="line-clamp-2 text-[13.5px] leading-snug text-muted">{s.short_description}</span> : null}
                        {meta ? <span className="mt-0.5 text-[12px] font-bold text-muted">{meta}</span> : null}
                      </span>
                      <span className="flex-none text-right text-[14.5px] font-extrabold">{priceText(s)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
