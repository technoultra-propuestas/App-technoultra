import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/shop/AddToCartButton";
import { FilterSheet } from "@/components/shop/FilterSheet";
import { ProductImage } from "@/components/store/ProductImage";
import { ChipRow, FilterChip, SearchField } from "@/components/ui/kit";
import { EmptyState } from "@/components/ui/layout";
import { copFormat } from "@/lib/catalog/normalize";
import { listFeatured, listProducts, loadFacets, type CatalogProduct, type ListFilters } from "@/lib/catalog/queries";
import { loadActiveBanner, loadShopSettings, type ShopBanner, type ShopSettings } from "@/lib/shop/settings";

type Sp = Record<string, string | undefined>;
type Facets = Awaited<ReturnType<typeof loadFacets>>;

export const parseFilters = (sp: Sp): ListFilters => ({
  q: sp.q?.slice(0, 60),
  marca: sp.marca?.slice(0, 60),
  orden: ["precio-asc", "precio-desc", "nombre"].includes(sp.orden ?? "") ? sp.orden : undefined,
  min: sp.min ? Number(sp.min.replace(/\D/g, "")) || undefined : undefined,
  max: sp.max ? Number(sp.max.replace(/\D/g, "")) || undefined : undefined,
  pagina: Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1),
});

const SORTS: [string | undefined, string][] = [
  [undefined, "Destacados"],
  ["precio-asc", "Precio: menor a mayor"],
  ["precio-desc", "Precio: mayor a menor"],
  ["nombre", "Nombre (A–Z)"],
];

/* ---------------------------------------------------------------- piezas */

/** Banner promocional (administrable). Sin banner activo no se renderiza nada. Tonos del sistema de diseño, nunca colores libres. */
function Banner({ b }: { b: ShopBanner }) {
  const tone = { dark: "bg-ink text-white", brand: "bg-brand text-ink", light: "border border-line bg-white text-ink" }[b.tone];
  const external = b.cta_href?.startsWith("https://");
  return (
    <section aria-label="Promoción" className={`relative flex min-h-[84px] items-stretch overflow-hidden rounded-card shadow-card sm:min-h-[148px] ${tone}`}>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-4 py-3 sm:gap-1 sm:px-8 sm:py-4">
        <h2 className="m-0 text-[17px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[28px]">{b.title}</h2>
        {b.subtitle ? <p className="m-0 line-clamp-1 text-[12.5px] font-semibold opacity-90 sm:line-clamp-2 sm:text-[15px]">{b.subtitle}</p> : null}
        {b.cta_label && b.cta_href ? (
          <Link href={b.cta_href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={`press mt-1.5 inline-flex min-h-11 w-fit items-center rounded-[12px] px-4 text-[13.5px] font-extrabold no-underline sm:mt-2 sm:text-[14px] ${b.tone === "brand" ? "bg-ink text-white" : "bg-brand text-ink"}`}>
            {b.cta_label}
          </Link>
        ) : null}
      </div>
      {b.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagen administrada; carga diferida y recortada
        <img src={b.image_url} alt="" loading="eager" className="hidden h-auto w-[34%] max-w-[360px] object-cover sm:block" />
      ) : null}
    </section>
  );
}

function ShippingStrip({ s }: { s: ShopSettings }) {
  if (!s.shipping_enabled) return null;
  return (
    <section aria-label={s.shipping_title} className="flex items-center gap-2.5 rounded-[14px] border border-line bg-white px-3.5 py-2.5 text-[12px] leading-snug text-ink-2 shadow-card sm:items-start sm:gap-3 sm:px-4 sm:py-3 sm:text-[13px]">
      <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-brand sm:mt-0.5">
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
        <circle cx="7.5" cy="18" r="1.6" />
        <circle cx="17.5" cy="18" r="1.6" />
      </svg>
      <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-0 sm:gap-x-5">
        <span className="font-extrabold text-ink">{s.shipping_title}</span>
        <span>Cali urbano <strong>{copFormat(s.shipping_urban_fee)}</strong></span>
        <span>Fuera del perímetro / zonas aledañas <strong>{copFormat(s.shipping_outside_fee)}</strong></span>
        {s.shipping_note ? <span className="text-muted">{s.shipping_note}</span> : null}
      </div>
    </section>
  );
}

/** Tarjeta compacta: imagen de proporción fija, marca, nombre (2 líneas), precio, disponibilidad y «+ Agregar». */
function ProductCard({ p, eager }: { p: CatalogProduct; eager?: boolean }) {
  return (
    <article className="flex w-full flex-col overflow-hidden rounded-[16px] border border-line bg-white shadow-card transition-shadow duration-200 hover:shadow-pop">
      <Link href={`/tienda/producto/${p.slug}`} className="block no-underline" aria-label={p.name}>
        <ProductImage src={p.image_url} alt={p.name} width={360} eager={eager} className="aspect-[5/4] w-full p-2" />
      </Link>
      <div className="flex flex-1 flex-col gap-1 px-3 pb-3 pt-1">
        {p.brand ? <span className="truncate text-[11px] font-extrabold uppercase tracking-[0.04em] text-muted">{p.brand}</span> : null}
        <Link href={`/tienda/producto/${p.slug}`} className="line-clamp-2 min-h-[2.5em] text-[13.5px] font-extrabold leading-snug text-ink no-underline">{p.name}</Link>
        <span className="text-[18px] font-extrabold tracking-[-0.01em]">{copFormat(p.price)}</span>
        <span className="text-[12px] font-bold text-ok">● Disponible</span>
        <div className="mt-1.5">
          <AddToCartButton productId={p.id} />
        </div>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------- vista */

/**
 * SHOP público (servidor). Escritorio: filtros a la izquierda y rejilla a la derecha. Móvil: cabecera compacta, categorías con scroll
 * horizontal, fila [Filtros] [Ordenar] (hojas inferiores) y productos de inmediato. Todo el filtrado se resuelve en la base de datos.
 */
export async function CatalogView({ catSlug, subSlug, sp }: { catSlug?: string; subSlug?: string; sp: Sp }) {
  const f = parseFilters(sp);
  const [facets, settings, banner] = await Promise.all([loadFacets(), loadShopSettings(), loadActiveBanner()]);
  const cat = catSlug ? facets.categories.find((c) => c.slug === catSlug) : undefined;
  const sub = cat && subSlug ? cat.subs.find((s) => s.slug === subSlug) : undefined;
  if ((catSlug && !cat) || (subSlug && !sub)) notFound(); // categoría o subcategoría inexistente o sin productos visibles
  const base = cat ? (sub ? `/tienda/categoria/${cat.slug}/${sub.slug}` : `/tienda/categoria/${cat.slug}`) : "/tienda";
  const { products, total, page, pages } = await listProducts(f, { categoryId: cat?.id, subcategoryId: sub?.id });
  const plain = !cat && !f.q && !f.marca && !f.min && !f.max && !f.orden && page === 1;
  const featured = plain && settings.show_featured ? await listFeatured(8) : [];
  const brands = [...new Set(facets.brands.filter((b) => (!cat || b.cat === cat.id) && (!sub || b.sub === sub.id)).map((b) => b.brand))].sort((a, b) => a.localeCompare(b, "es"));
  const qs = (over: Sp) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: f.q, marca: f.marca, orden: f.orden, min: f.min ? String(f.min) : undefined, max: f.max ? String(f.max) : undefined, ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const active = [f.marca, f.min, f.max].filter(Boolean).length;
  const heading = sub?.name ?? cat?.name ?? settings.title;

  const filtersForm = (
    <form method="get" action={base} className="flex flex-col gap-3">
      {f.q ? <input type="hidden" name="q" value={f.q} /> : null}
      {f.orden ? <input type="hidden" name="orden" value={f.orden} /> : null}
      <label className="flex flex-col gap-1 text-[13px] font-bold">
        Marca
        <select name="marca" defaultValue={f.marca ?? ""} className="h-12 rounded-ctl border-[1.5px] border-line-strong bg-white px-3 text-[15px] font-semibold">
          <option value="">Todas</option>
          {brands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Precio mínimo
          <input name="min" inputMode="numeric" defaultValue={f.min ?? ""} placeholder="$0" className="h-12 w-full rounded-ctl border-[1.5px] border-line-strong bg-white px-3 text-[15px] font-semibold" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Precio máximo
          <input name="max" inputMode="numeric" defaultValue={f.max ?? ""} placeholder="Sin tope" className="h-12 w-full rounded-ctl border-[1.5px] border-line-strong bg-white px-3 text-[15px] font-semibold" />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="press min-h-12 flex-1 rounded-ctl bg-ink px-5 text-[15px] font-extrabold text-white">Aplicar</button>
        {active ? <Link href={`${base}${qs({ marca: undefined, min: undefined, max: undefined, pagina: undefined })}`} className="flex min-h-12 items-center rounded-ctl border border-line-strong px-4 text-[14px] font-extrabold text-ink no-underline">Limpiar</Link> : null}
      </div>
    </form>
  );

  const categoryNav = (
    <nav aria-label="Categorías" className="flex flex-col gap-0.5">
      <Link href={`/tienda${qs({ pagina: undefined, marca: undefined })}`} aria-current={!cat ? "page" : undefined} className={`flex min-h-11 items-center justify-between rounded-[12px] px-3 text-[14px] font-extrabold no-underline ${!cat ? "bg-ink text-white" : "text-ink hover:bg-paper"}`}>
        <span>Todo</span>
        <span className={!cat ? "text-[#D6D6D2]" : "text-muted"}>{facets.total}</span>
      </Link>
      {facets.categories.map((c) => (
        <div key={c.id} className="flex flex-col">
          <Link href={`/tienda/categoria/${c.slug}${qs({ pagina: undefined, marca: undefined })}`} aria-current={cat?.id === c.id && !sub ? "page" : undefined} className={`flex min-h-11 items-center justify-between rounded-[12px] px-3 text-[14px] font-extrabold no-underline ${cat?.id === c.id && !sub ? "bg-ink text-white" : "text-ink hover:bg-paper"}`}>
            <span>{c.name}</span>
            <span className={cat?.id === c.id && !sub ? "text-[#D6D6D2]" : "text-muted"}>{c.count}</span>
          </Link>
          {cat?.id === c.id ? (
            <div className="ml-3 flex flex-col border-l border-line pl-2">
              {c.subs.map((s) => (
                <Link key={s.id} href={`/tienda/categoria/${c.slug}/${s.slug}${qs({ pagina: undefined, marca: undefined })}`} aria-current={sub?.id === s.id ? "page" : undefined} className={`flex min-h-11 items-center justify-between rounded-[10px] px-3 text-[13.5px] font-bold no-underline ${sub?.id === s.id ? "bg-brand text-ink" : "text-ink-2 hover:bg-paper"}`}>
                  <span>{s.name}</span>
                  <span className="text-muted">{s.count}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-extrabold leading-none tracking-[-0.03em] sm:text-[34px]">{heading}</h1>
          {settings.subtitle && !cat ? <p className="m-0 mt-1.5 line-clamp-1 text-[14px] text-muted sm:text-base">{settings.subtitle}</p> : null}
        </div>
      </div>
      {banner ? <Banner b={banner} /> : null}
      <ShippingStrip s={settings} />
      <SearchField placeholder="Buscar por nombre, marca o referencia" defaultValue={f.q} keep={{ marca: f.marca, orden: f.orden }} />

      {/* Móvil: categorías con scroll horizontal y fila compacta de Filtros / Ordenar */}
      <div className="flex flex-col gap-3 lg:hidden">
        <ChipRow label="Categorías">
          <FilterChip href={`/tienda${qs({ pagina: undefined, marca: undefined })}`} on={!cat}>Todo</FilterChip>
          {facets.categories.map((c) => (
            <FilterChip key={c.id} href={`/tienda/categoria/${c.slug}${qs({ pagina: undefined, marca: undefined })}`} on={cat?.id === c.id}>{c.name}</FilterChip>
          ))}
        </ChipRow>
        {cat && cat.subs.length ? (
          <ChipRow label={`Subcategorías de ${cat.name}`}>
            <FilterChip href={`/tienda/categoria/${cat.slug}${qs({ pagina: undefined, marca: undefined })}`} on={!sub}>Todas</FilterChip>
            {cat.subs.map((s) => (
              <FilterChip key={s.id} href={`/tienda/categoria/${cat.slug}/${s.slug}${qs({ pagina: undefined, marca: undefined })}`} on={sub?.id === s.id}>{s.name}</FilterChip>
            ))}
          </ChipRow>
        ) : null}
        <div className="flex gap-2">
          <FilterSheet label="Filtros" title="Filtros" badge={active}>{filtersForm}</FilterSheet>
          <FilterSheet label="Ordenar" title="Ordenar por" icon="sort">
            <ul className="m-0 flex list-none flex-col p-0">
              {SORTS.map(([k, l]) => (
                <li key={l}>
                  <Link href={`${base}${qs({ orden: k, pagina: undefined })}`} aria-current={(f.orden ?? undefined) === k ? "true" : undefined} className="flex min-h-12 items-center justify-between border-b border-line text-[15px] font-bold text-ink no-underline">
                    {l}
                    {(f.orden ?? undefined) === k ? <span aria-hidden className="text-brand-text">✓</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </FilterSheet>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
        <aside aria-label="Filtros" className="sticky top-4 hidden max-h-[calc(100dvh-2rem)] flex-col gap-5 overflow-y-auto rounded-card border border-line bg-white p-4 shadow-card lg:flex">
          <div>
            <h2 className="m-0 mb-1 text-[13px] font-extrabold uppercase tracking-[0.05em] text-muted">Categorías</h2>
            {categoryNav}
          </div>
          <div>
            <h2 className="m-0 mb-2 text-[13px] font-extrabold uppercase tracking-[0.05em] text-muted">Filtrar</h2>
            {filtersForm}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {featured.length ? (
            <section aria-label="Destacados" className="flex flex-col gap-2">
              <h2 className="m-0 text-[18px] font-extrabold">Destacados</h2>
              <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 xl:grid-cols-4">
                {featured.slice(0, 4).map((p, i) => (
                  <li key={p.id} className="flex"><ProductCard p={p} eager={i < 2} /></li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <p role="status" className="m-0 text-[13px] font-semibold text-muted">{total} {total === 1 ? "producto" : "productos"}</p>
            <div className="hidden items-center gap-2 lg:flex" role="group" aria-label="Ordenar">
              {SORTS.map(([k, l]) => (
                <Link key={l} href={`${base}${qs({ orden: k, pagina: undefined })}`} aria-current={(f.orden ?? undefined) === k ? "true" : undefined} className={`flex min-h-10 items-center rounded-full border px-3 text-[12.5px] font-extrabold no-underline ${(f.orden ?? undefined) === k ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"}`}>
                  {l}
                </Link>
              ))}
            </div>
          </div>
          {products.length === 0 ? (
            <EmptyState title="No encontramos productos en esta categoría." text="Prueba con otra búsqueda o quita algún filtro." action={<Link href="/tienda" className="text-[14px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">Ver todo el catálogo</Link>} />
          ) : (
            <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 xl:grid-cols-4">
              {products.map((p, i) => (
                <li key={p.id} className="flex">
                  <ProductCard p={p} eager={i < 4} />
                </li>
              ))}
            </ul>
          )}
          {pages > 1 ? (
            <nav aria-label="Páginas" className="flex items-center justify-between gap-3">
              {page > 1 ? <FilterChip href={`${base}${qs({ pagina: String(page - 1) })}`}>← Anterior</FilterChip> : <span />}
              <span className="text-[14px] font-bold text-muted">Página {page} de {pages}</span>
              {page < pages ? <FilterChip href={`${base}${qs({ pagina: String(page + 1) })}`}>Siguiente →</FilterChip> : <span />}
            </nav>
          ) : null}
          <p className="m-0 text-[12.5px] text-muted">Disponibilidad y precio sujetos a confirmación por WhatsApp.</p>
        </div>
      </div>
    </div>
  );
}
