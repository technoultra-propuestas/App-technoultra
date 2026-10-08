/**
 * Esqueletos del Shop: aparecen al instante al pulsar un producto/categoría/filtro mientras el servidor prepara la página (el shell y la
 * navegación inferior quedan fijos). Cada `loading.tsx` del Shop vive DENTRO del segmento cuya existencia ya se validó (layouts de producto y
 * categoría), de modo que un recurso inexistente responde 404 HTTP real aunque la página se transmita por partes.
 */
export function ShopListSkeleton() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-5">
      <div className="h-9 w-48 animate-pulse rounded-[10px] bg-[#EDEDEA]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex flex-col gap-2 rounded-card border border-line bg-white p-3">
            <div className="aspect-square w-full animate-pulse rounded-[12px] bg-[#EDEDEA]" />
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-[#EDEDEA]" />
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-[#F3F3F1]" />
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

export function ShopProductSkeleton() {
  return (
    <div role="status" aria-label="Cargando producto" className="flex flex-col gap-5">
      <div className="h-4 w-40 animate-pulse rounded bg-[#EDEDEA]" />
      <div className="grid gap-8 md:grid-cols-2">
        <div className="aspect-square w-full animate-pulse rounded-card border border-line bg-[#EDEDEA]" />
        <div className="flex flex-col gap-4">
          <div className="h-8 w-3/4 animate-pulse rounded bg-[#EDEDEA]" />
          <div className="h-10 w-1/3 animate-pulse rounded bg-[#EDEDEA]" />
          <div className="h-14 w-full animate-pulse rounded-[14px] bg-[#F3F3F1]" />
          <div className="h-14 w-full animate-pulse rounded-[14px] bg-[#F3F3F1]" />
        </div>
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
