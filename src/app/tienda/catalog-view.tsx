import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "@/components/store/ProductImage";
import { ShippingInfo } from "@/components/store/ShippingInfo";
import { WhatsappCta } from "@/components/store/WhatsappCta";
import { ChipRow, FilterChip, SearchField } from "@/components/ui/kit";
import { EmptyState } from "@/components/ui/layout";
import { loadFacets, listProducts, type ListFilters } from "@/lib/catalog/queries";
import { copFormat } from "@/lib/catalog/normalize";
import { productWhatsappUrl } from "@/lib/catalog/whatsapp";

type Sp = Record<string, string | undefined>;

export const parseFilters = (sp: Sp): ListFilters => ({
  q: sp.q?.slice(0, 60),
  marca: sp.marca?.slice(0, 60),
  orden: ["precio-asc", "precio-desc", "nombre"].includes(sp.orden ?? "") ? sp.orden : "nombre",
  min: sp.min ? Number(sp.min.replace(/\D/g, "")) || undefined : undefined,
  max: sp.max ? Number(sp.max.replace(/\D/g, "")) || undefined : undefined,
  pagina: Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1),
});

/** Catálogo público (servidor): categorías, subcategorías, búsqueda, marca, precio, orden y paginación. Todo se resuelve en la base de datos. */
export async function CatalogView({ catSlug, subSlug, sp }: { catSlug?: string; subSlug?: string; sp: Sp }) {
  const f = parseFilters(sp);
  const facets = await loadFacets();
  const cat = catSlug ? facets.categories.find((c) => c.slug === catSlug) : undefined;
  const sub = cat && subSlug ? cat.subs.find((s) => s.slug === subSlug) : undefined;
  if ((catSlug && !cat) || (subSlug && !sub)) notFound(); // categoría u subcategoría inexistente o sin productos visibles
  const base = cat ? (sub ? `/tienda/categoria/${cat.slug}/${sub.slug}` : `/tienda/categoria/${cat.slug}`) : "/tienda";
  const { products, total, page, pages } = await listProducts(f, { categoryId: cat?.id, subcategoryId: sub?.id });
  const brands = [...new Set(facets.brands.filter((b) => (!cat || b.cat === cat.id) && (!sub || b.sub === sub.id)).map((b) => b.brand))].sort((a, b) => a.localeCompare(b, "es"));
  const qs = (over: Sp) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: f.q, marca: f.marca, orden: f.orden === "nombre" ? undefined : f.orden, min: f.min ? String(f.min) : undefined, max: f.max ? String(f.max) : undefined, ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const catQs = qs({ pagina: undefined, marca: undefined });
  const heading = sub?.name ?? cat?.name ?? "Tienda";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="m-0 text-[34px] font-extrabold tracking-[-0.03em]">{heading}</h1>
        <div className="my-3 h-1 w-10 rounded-sm bg-brand" />
        <p className="m-0 max-w-[640px] text-base leading-normal text-muted">Tecnología con garantía de TechnoUltra. Escríbenos por WhatsApp para confirmar disponibilidad, precio y entrega; sin crear cuenta.</p>
      </div>
      <SearchField placeholder="Buscar por nombre, marca o referencia" defaultValue={f.q} keep={{ marca: f.marca, orden: f.orden === "nombre" ? undefined : f.orden }} />
      {facets.categories.length ? (
        <ChipRow label="Categorías">
          <FilterChip href={`/tienda${catQs}`} on={!cat} count={facets.total}>Todo</FilterChip>
          {facets.categories.map((c) => (
            <FilterChip key={c.id} href={`/tienda/categoria/${c.slug}${catQs}`} on={cat?.id === c.id} count={c.count}>{c.name}</FilterChip>
          ))}
        </ChipRow>
      ) : null}
      {cat && cat.subs.length ? (
        <ChipRow label={`Subcategorías de ${cat.name}`}>
          <FilterChip href={`/tienda/categoria/${cat.slug}${catQs}`} on={!sub} count={cat.count}>Todas</FilterChip>
          {cat.subs.map((s) => (
            <FilterChip key={s.id} href={`/tienda/categoria/${cat.slug}/${s.slug}${catQs}`} on={sub?.id === s.id} count={s.count}>{s.name}</FilterChip>
          ))}
        </ChipRow>
      ) : null}
      <form method="get" className="grid gap-3 rounded-card border border-line bg-white p-4 shadow-card sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] sm:items-end">
        {f.q ? <input type="hidden" name="q" value={f.q} /> : null}
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Marca
          <select name="marca" defaultValue={f.marca ?? ""} className="h-12 rounded-ctl border-[1.5px] border-line-strong bg-white px-3 text-[15px] font-semibold">
            <option value="">Todas</option>
            {brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Precio mínimo
          <input name="min" inputMode="numeric" defaultValue={f.min ?? ""} placeholder="$0" className="h-12 rounded-ctl border-[1.5px] border-line-strong bg-white px-3 text-[15px] font-semibold" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Precio máximo
          <input name="max" inputMode="numeric" defaultValue={f.max ?? ""} placeholder="Sin tope" className="h-12 rounded-ctl border-[1.5px] border-line-strong bg-white px-3 text-[15px] font-semibold" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Ordenar
          <select name="orden" defaultValue={f.orden} className="h-12 rounded-ctl border-[1.5px] border-line-strong bg-white px-3 text-[15px] font-semibold">
            <option value="nombre">Nombre</option>
            <option value="precio-asc">Precio: menor a mayor</option>
            <option value="precio-desc">Precio: mayor a menor</option>
          </select>
        </label>
        <button type="submit" className="press h-12 rounded-ctl bg-ink px-5 text-[15px] font-extrabold text-white">Aplicar</button>
      </form>
      <p role="status" className="m-0 text-[13px] font-semibold text-muted">{total} {total === 1 ? "producto" : "productos"}</p>
      {products.length === 0 ? (
        <EmptyState title="No encontramos productos en esta categoría." text="Prueba con otra búsqueda o quita algún filtro." action={<Link href="/tienda" className="text-[14px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">Ver todo el catálogo</Link>} />
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p, i) => (
            <li key={p.id} className="flex">
              <article className="flex w-full flex-col overflow-hidden rounded-card border border-line bg-white shadow-card">
                <Link href={`/tienda/producto/${p.slug}`} className="block no-underline" aria-label={p.name}>
                  <ProductImage src={p.image_url} alt={p.name} width={420} eager={i < 4} className="aspect-square w-full" />
                </Link>
                <div className="flex flex-1 flex-col gap-1.5 p-3.5">
                  {p.brand ? <span className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-muted">{p.brand}</span> : null}
                  <Link href={`/tienda/producto/${p.slug}`} className="line-clamp-3 text-[14.5px] font-extrabold leading-snug text-ink no-underline">{p.name}</Link>
                  <span className="text-[20px] font-extrabold tracking-[-0.01em]">{copFormat(p.price)}</span>
                  <span className="text-[12.5px] font-bold text-ok">● 1 unidad disponible</span>
                  <div className="mt-auto pt-2">
                    <WhatsappCta productId={p.id} href={productWhatsappUrl({ name: p.name, ref: p.source_ref, price: p.price, brand: p.brand })} label="Consultar por WhatsApp" compact />
                  </div>
                </div>
              </article>
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
      <p className="m-0 text-[13px] text-muted">Disponibilidad y precio sujetos a confirmación por WhatsApp.</p>
      <ShippingInfo />
    </div>
  );
}
