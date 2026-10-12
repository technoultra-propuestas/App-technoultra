"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconSearch, IconXCircle } from "@/components/ui/icons";

type Hit = { id: string; name: string; brand: string | null; ref: string | null; price: number; image: string | null; available: boolean };
const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/**
 * Buscador de productos del catálogo para la cotización. Busca en el SERVIDOR (`/api/b/productos`) con espera de 300 ms entre teclas y
 * cancela la consulta anterior: no descarga el catálogo. Elegir un producto solo fija el campo `refId` (no envía el formulario).
 */
export function ProductSearch({ name = "refId", error }: { name?: string; error?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [picked, setPicked] = useState<Hit | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      ctrl.current?.abort();
      const t = setTimeout(() => {
        setHits([]);
        setStatus("idle");
      }, 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      setStatus("loading");
      try {
        const res = await fetch(`/api/b/productos?q=${encodeURIComponent(term)}`, { signal: c.signal, cache: "no-store" });
        const out = (await res.json().catch(() => ({}))) as { results?: Hit[] };
        if (!res.ok) throw new Error(String(res.status));
        setHits(out.results ?? []);
        setStatus("done");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      <label htmlFor={`${listId}-q`} className="text-[13px] font-bold">
        Buscar producto (nombre, referencia o marca)
      </label>
      <div className="relative">
        <IconSearch aria-hidden width={18} height={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          id={`${listId}-q`}
          type="search"
          inputMode="search"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault(); // Enter no envía el formulario de la cotización
          }}
          aria-controls={`${listId}-list`}
          aria-describedby={`${listId}-st`}
          placeholder="Ej.: SSD 480, Kingston, 100-100001405"
          className="h-12 w-full min-w-0 rounded-[12px] border border-line-strong bg-white pl-10 pr-11 text-[15px]"
        />
        {q ? (
          <button type="button" onClick={() => setQ("")} aria-label="Borrar búsqueda" className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted">
            <IconXCircle width={18} height={18} />
          </button>
        ) : null}
      </div>
      <p id={`${listId}-st`} role="status" className="m-0 min-h-[18px] text-[12.5px] font-semibold text-muted">
        {status === "loading" ? "Buscando…" : status === "error" ? "No pudimos buscar ahora. Inténtalo de nuevo." : status === "done" && hits.length === 0 ? "Sin coincidencias. Prueba con otra palabra o la referencia." : status === "done" ? `${hits.length} resultado${hits.length === 1 ? "" : "s"}` : "Escribe al menos 2 letras."}
      </p>
      {hits.length ? (
        <ul id={`${listId}-list`} className="m-0 flex max-h-[320px] list-none flex-col gap-1 overflow-y-auto rounded-[12px] border border-line p-1">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => setPicked(h)}
                aria-pressed={picked?.id === h.id}
                disabled={!h.available}
                className={`flex min-h-[56px] w-full items-center gap-3 rounded-[10px] px-2 py-1.5 text-left disabled:opacity-50 ${picked?.id === h.id ? "bg-[#FFF6E8] ring-2 ring-brand" : "hover:bg-paper"}`}
              >
                {h.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.image} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 flex-none rounded-[8px] border border-line object-contain" />
                ) : (
                  <span aria-hidden className="h-10 w-10 flex-none rounded-[8px] bg-paper" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14px] font-bold">{h.name}</span>
                  <span className="truncate text-[12px] text-muted">
                    {[h.brand, h.ref ? `Ref. ${h.ref}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex flex-none flex-col items-end">
                  <span className="text-[14px] font-extrabold tabular-nums">{cop.format(h.price)}</span>
                  <span className={`text-[11.5px] font-bold ${h.available ? "text-ok" : "text-danger"}`}>{h.available ? "Disponible" : "Agotado"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {picked ? (
        <p className="m-0 rounded-[10px] bg-ok-soft px-3 py-2 text-[13px] font-bold text-ok">
          Seleccionado: {picked.name} · {cop.format(picked.price)} (el precio final lo fija el catálogo al agregar)
        </p>
      ) : null}
      {error ? <p className="m-0 text-[13px] font-bold text-danger">{error}</p> : null}
    </div>
  );
}
