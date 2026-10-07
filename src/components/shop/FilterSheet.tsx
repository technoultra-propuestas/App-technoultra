"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Hoja inferior (móvil) con el contenido que se le pase (formularios y enlaces ya renderizados en el servidor). No ocupa la pantalla
 * mientras está cerrada. Cierra con Escape, con el fondo o con «Cerrar»; bloquea el scroll del fondo y devuelve el foco al botón.
 */
export function FilterSheet({ label, title, badge, children, icon }: { label: string; title: string; badge?: number; children: ReactNode; icon?: "filter" | "sort" }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    panel.current?.querySelector<HTMLElement>("button,a,input,select")?.focus();
    const btn = trigger.current;
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      btn?.focus();
    };
  }, [open]);

  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className="press inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-ctl border border-line-strong bg-white px-4 text-[14px] font-extrabold text-ink">
        <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {icon === "sort" ? <path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" /> : <path d="M3 5h18M6 12h12M10 19h4" />}
        </svg>
        {label}
        {badge ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-extrabold">{badge}</span> : null}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div aria-hidden className="absolute inset-0 bg-black/45" onClick={() => setOpen(false)} />
          <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="enter relative flex max-h-[85dvh] w-full max-w-[520px] flex-col rounded-t-[24px] bg-white shadow-pop sm:rounded-[24px]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <h2 id={titleId} className="m-0 text-[18px] font-extrabold">{title}</h2>
              <button type="button" onClick={() => setOpen(false)} className="press min-h-11 px-3 text-[14px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">Cerrar</button>
            </div>
            <div className="overflow-y-auto px-5 py-4" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>{children}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
