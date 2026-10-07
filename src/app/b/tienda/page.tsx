import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, fmtDateTime, money } from "@/components/ui/layout";
import { ChipRow, FilterChip, PrimaryLink, SearchField, SegmentTabs } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProductCategoryForm } from "./forms";

export const metadata: Metadata = { title: "Tienda · Productos", robots: { index: false } };

const STORE_TABS = [
  { key: "pedidos", label: "Pedidos", href: "/b/pedidos" },
  { key: "productos", label: "Productos", href: "/b/tienda" },
  { key: "sync", label: "Sincronización", href: "/b/tienda/sincronizacion" },
];
const PAGE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Sp = { q?: string; cat?: string; sub?: string; estado?: string; pagina?: string };
type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const warranty = (d: number) => (d <= 0 ? "Sin garantía" : d % 30 === 0 ? `Garantía ${d / 30} ${d / 30 === 1 ? "mes" : "meses"}` : `Garantía ${d} días`);

export default async function ProductsAdminPage({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireRole(["superadmin"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);
  const q = (sp.q ?? "").replace(/[%_,()*\\]/g, " ").trim().slice(0, 60);
  let query = supabase
    .from("products")
    .select("id, name, sku, price, is_active, warranty_days, source, source_available, source_ref, last_synced_at, product_categories(name), product_subcategories(name), product_source(source_price, source_stock)", { count: "exact" })
    .is("deleted_at", null);
  if (sp.cat && UUID.test(sp.cat)) query = query.eq("category_id", sp.cat);
  if (sp.sub && UUID.test(sp.sub)) query = query.eq("subcategory_id", sp.sub);
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%,source_ref.ilike.%${q}%`);
  if (sp.estado === "visibles") query = query.eq("is_active", true).eq("source_available", true);
  if (sp.estado === "ocultos") query = query.eq("is_active", false);
  if (sp.estado === "sin_stock") query = query.eq("source_available", false);
  const [{ data: products, count }, { data: inventory }, { data: cats }, { data: subs }, { data: lastRun }] = await Promise.all([
    query.order("name").range((page - 1) * PAGE, page * PAGE - 1),
    supabase.from("inventory").select("product_id, stock_on_hand, reorder_level"),
    supabase.from("product_categories").select("id, name").order("name"),
    supabase.from("product_subcategories").select("id, name, category_id").order("name"),
    supabase.from("catalog_sync_runs").select("started_at, status").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const inv = new Map((inventory ?? []).map((i) => [i.product_id, i]));
  const list = products ?? [];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (over: Partial<Sp>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...over })) if (v) p.set(k, String(v));
    const s = p.toString();
    return `/b/tienda${s ? `?${s}` : ""}`;
  };
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">Tienda</h1>
        <PrimaryLink href="/b/tienda/nuevo" icon="plus">
          Nuevo producto
        </PrimaryLink>
      </div>
      <SegmentTabs label="Secciones de la tienda" items={STORE_TABS} active="productos" />
      {lastRun ? (
        <p className={`m-0 text-[13px] font-semibold ${lastRun.status === "error" ? "text-danger" : "text-muted"}`}>
          Última sincronización: {fmtDateTime(lastRun.started_at)} · {lastRun.status === "success" ? "exitosa" : lastRun.status === "partial" ? "parcial" : "con error"} · <Link href="/b/tienda/sincronizacion" className="font-extrabold text-ink">ver historial</Link>
        </p>
      ) : null}
      <SearchField placeholder="Buscar por nombre, referencia o marca" defaultValue={q} keep={{ cat: sp.cat, sub: sp.sub, estado: sp.estado }} />
      <ChipRow label="Estado">
        {[["", "Todos"], ["visibles", "Visibles al público"], ["ocultos", "Ocultos por mí"], ["sin_stock", "Sin disponibilidad en la fuente"]].map(([k, l]) => (
          <FilterChip key={k} href={href({ estado: k || undefined, pagina: undefined })} on={(sp.estado ?? "") === k}>{l}</FilterChip>
        ))}
      </ChipRow>
      <ChipRow label="Categorías">
        <FilterChip href={href({ cat: undefined, sub: undefined, pagina: undefined })} on={!sp.cat}>Todas</FilterChip>
        {(cats ?? []).map((c) => (
          <FilterChip key={c.id} href={href({ cat: c.id, sub: undefined, pagina: undefined })} on={sp.cat === c.id}>{c.name}</FilterChip>
        ))}
      </ChipRow>
      {sp.cat && (subs ?? []).some((s) => s.category_id === sp.cat) ? (
        <ChipRow label="Subcategorías">
          <FilterChip href={href({ sub: undefined, pagina: undefined })} on={!sp.sub}>Todas</FilterChip>
          {(subs ?? []).filter((s) => s.category_id === sp.cat).map((s) => (
            <FilterChip key={s.id} href={href({ sub: s.id, pagina: undefined })} on={sp.sub === s.id}>{s.name}</FilterChip>
          ))}
        </ChipRow>
      ) : null}
      <p role="status" className="m-0 text-[13px] font-semibold text-muted">{total} producto(s)</p>
      {list.length === 0 ? (
        <EmptyState title="No hay productos con esos filtros" text="Cambia los filtros o carga el catálogo desde «Sincronización»." />
      ) : (
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-white p-0 shadow-card">
          {list.map((p) => {
            const i = inv.get(p.id);
            const src = one(p.product_source as Rel<{ source_price: number; source_stock: number }>);
            const isSource = p.source !== null;
            const stock = i?.stock_on_hand ?? 0;
            const out = isSource ? !p.source_available : stock <= 0;
            const low = !isSource && !out && i && stock <= i.reorder_level;
            const cat = one(p.product_categories as Rel<{ name: string }>);
            const sub = one(p.product_subcategories as Rel<{ name: string }>);
            const publicNow = p.is_active && p.source_available;
            return (
              <li key={p.id} className="border-b border-line last:border-0">
                <Link href={`/b/tienda/${p.id}`} className="press grid min-h-[64px] items-center gap-x-4 gap-y-1 px-5 py-3 text-ink no-underline hover:bg-paper md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_130px_130px_140px]">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-extrabold">{p.name}</span>
                    <span className="truncate text-[12.5px] font-semibold text-muted">{p.source_ref ?? p.sku}{isSource ? " · Excelenter" : ""}{p.is_active ? "" : " · Oculto por el administrador"}</span>
                  </span>
                  <span className="truncate text-[14px] font-semibold text-ink-2">{cat?.name ?? "Sin categoría"}{sub ? ` › ${sub.name}` : ""}</span>
                  <span className="flex flex-col md:items-end">
                    <span className="text-[15px] font-extrabold">{money(p.price)}</span>
                    {src ? <span className="text-[12px] font-semibold text-muted">Fuente {money(src.source_price)}</span> : <span className="text-[12px] font-semibold text-muted">{warranty(p.warranty_days)}</span>}
                  </span>
                  <span className="text-[13px] font-semibold text-ink-2">{isSource ? (publicNow ? "Público" : "No público") : warranty(p.warranty_days)}</span>
                  <span className="justify-self-start md:justify-self-end">
                    <span className={`inline-flex rounded-full px-3 py-1 text-[12.5px] font-extrabold ${out ? "bg-danger-soft text-danger" : low ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>{out ? (isSource ? "Sin disponibilidad" : "Agotado") : isSource ? "Disponible" : `${stock} u.`}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 ? (
        <nav aria-label="Páginas" className="flex items-center justify-between gap-3">
          {page > 1 ? <FilterChip href={href({ pagina: String(page - 1) })}>← Anterior</FilterChip> : <span />}
          <span className="text-[14px] font-bold text-muted">Página {page} de {pages}</span>
          {page < pages ? <FilterChip href={href({ pagina: String(page + 1) })}>Siguiente →</FilterChip> : <span />}
        </nav>
      ) : null}
      <details className="rounded-card border border-line bg-white p-5 shadow-card">
        <summary className="cursor-pointer text-[17px] font-extrabold">Categorías de productos</summary>
        <div className="max-w-[420px] pt-4">
          <ProductCategoryForm />
        </div>
      </details>
    </section>
  );
}
