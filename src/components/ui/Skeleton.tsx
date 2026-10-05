/** Esqueleto de carga (respeta prefers-reduced-motion mediante la regla global). */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-4">
      <div className="h-9 w-56 animate-pulse rounded-[10px] bg-[#EDEDEA]" />
      <div className="h-1 w-10 rounded-sm bg-brand" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-[20px] border border-line bg-white" />
        ))}
      </div>
    </div>
  );
}
