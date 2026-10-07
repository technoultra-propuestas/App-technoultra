import type { ReactNode } from "react";
import { fmtDateTime, StatusBadge } from "@/components/ui/layout";

/**
 * Piezas de las pantallas de detalle (ticket, pedido, proyecto…). Componentes de servidor, sin estado.
 */

/** Cabecera de detalle: tarjeta oscura con código, estado y mensaje principal (jerarquía: qué es → cómo va → qué sigue). */
export function StatusHero({ code, subtitle, status, message, meta }: { code: string; subtitle?: string; status: string; message?: string; meta?: ReactNode }) {
  return (
    <section aria-label={`Resumen de ${code}`} className="flex flex-col gap-4 rounded-card bg-ink p-5 text-white shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 text-[28px] font-extrabold leading-none tracking-[-0.025em] text-brand">{code}</h1>
          {subtitle ? <p className="m-0 text-[14px] font-semibold text-[#D6D6D2]">{subtitle}</p> : null}
        </div>
        <StatusBadge status={status} />
      </div>
      {message ? <p className="m-0 text-[17px] font-bold leading-snug">{message}</p> : null}
      {meta ? <div className="text-[13px] font-semibold text-[#B9B9B4]">{meta}</div> : null}
    </section>
  );
}

const FLOW = [
  { key: "received", label: "Recibido" },
  { key: "diagnosing", label: "Diagnóstico" },
  { key: "awaiting_approval", label: "Aprobación" },
  { key: "in_service", label: "Servicio" },
  { key: "ready", label: "Listo" },
  { key: "delivered", label: "Entregado" },
];
const STEP_OF: Record<string, number> = { received: 0, diagnosing: 1, awaiting_approval: 2, awaiting_part: 3, in_service: 3, testing: 3, ready: 4, delivered: 5 };

/** Avance del servicio para el cliente. Los estados intermedios (repuesto, pruebas) cuentan dentro de «Servicio». */
export function ProgressSteps({ status }: { status: string }) {
  const cur = STEP_OF[status];
  if (cur === undefined) return null; // cancelado u otro: sin barra de avance
  return (
    <ol aria-label="Avance del servicio" className="m-0 grid list-none grid-cols-6 gap-1 p-0">
      {FLOW.map((s, i) => {
        const done = i < cur;
        const now = i === cur;
        return (
          <li key={s.key} aria-current={now ? "step" : undefined} className="flex flex-col items-center gap-1.5 text-center">
            <span className={`h-1.5 w-full rounded-full ${done || now ? "bg-brand" : "bg-line-strong"}`} />
            <span className={`text-[11px] leading-tight sm:text-[12px] ${now ? "font-extrabold text-ink" : done ? "font-bold text-ink-2" : "font-semibold text-muted"}`}>
              <span className="sr-only">{done ? "Completado: " : now ? "Paso actual: " : "Pendiente: "}</span>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Línea de tiempo vertical (más reciente resaltada). `items` ya viene en el orden a mostrar. */
export function Timeline({ items }: { items: { id: string | number; title: string; at: string; detail?: string | null }[] }) {
  if (!items.length) return <p className="m-0 text-[14px] text-muted">Todavía no hay movimientos.</p>;
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {items.map((h, i) => (
        <li key={h.id} className="relative flex gap-3 pb-4 last:pb-0">
          {i < items.length - 1 ? <span aria-hidden className="absolute left-[7px] top-4 h-[calc(100%-8px)] w-0.5 bg-line-strong" /> : null}
          <span aria-hidden className={`mt-1 h-4 w-4 flex-none rounded-full border-[3px] ${i === 0 ? "border-brand bg-ink" : "border-line-strong bg-white"}`} />
          <div className="flex min-w-0 flex-col">
            <span className={`text-[15px] ${i === 0 ? "font-extrabold" : "font-bold"}`}>{h.title}</span>
            <span className="text-[13px] font-semibold text-muted">{fmtDateTime(h.at)}</span>
            {h.detail ? <span className="mt-0.5 text-[13px] text-ink-2">{h.detail}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Par «etiqueta · valor» para fichas (cliente, equipo, datos del pedido). */
export function InfoList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="m-0 flex flex-col gap-2.5">
      {rows
        .filter((r) => r.value !== null && r.value !== undefined && r.value !== "")
        .map((r) => (
          <div key={r.label} className="flex flex-col">
            <dt className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-muted">{r.label}</dt>
            <dd className="m-0 text-[15px] font-semibold text-ink">{r.value}</dd>
          </div>
        ))}
    </dl>
  );
}

/** Tarjeta con título de sección (variante simple de `Section`, con subtítulo opcional). */
export function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-5 shadow-card">
      <div>
        <h2 className="m-0 text-[17px] font-extrabold tracking-[-0.01em]">{title}</h2>
        {hint ? <p className="m-0 mt-0.5 text-[13px] text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}
