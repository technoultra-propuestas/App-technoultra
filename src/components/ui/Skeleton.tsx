/** Esqueleto de carga con la forma real de las pantallas (título, cifras y filas). Respeta prefers-reduced-motion por la regla global. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-5">
      <div className="h-9 w-56 animate-pulse rounded-[10px] bg-[#EDEDEA]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[132px] animate-pulse rounded-card border border-line bg-white" />
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-card border border-line bg-white p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="h-10 w-10 flex-none animate-pulse rounded-[12px] bg-[#EDEDEA]" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-[#EDEDEA]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[#F3F3F1]" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
