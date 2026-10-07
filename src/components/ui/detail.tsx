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

/**
 * Avance del servicio para el cliente. Los pasos salen de `progressSteps` (lib/domain/ticket-flow.ts): con equipo físico
 * «Solicitud · Equipo recibido · Diagnóstico · Aprobación · Servicio · Entrega»; en soporte remoto no hay paso de equipo.
 * `current === steps.length` = todo completado.
 */
export function ProgressSteps({ steps, current }: { steps: string[]; current: number }) {
  const total = steps.length;
  const label = current >= total ? "Servicio completado" : `Paso ${current + 1} de ${total}: ${steps[current]}`;
  return (
    <div className="flex flex-col gap-2">
      <ol aria-label="Avance del servicio" className="m-0 grid list-none gap-1 p-0" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <li key={s} aria-current={now ? "step" : undefined} className="flex flex-col items-center gap-1.5 text-center">
              <span className={`h-1.5 w-full rounded-full ${done || now ? "bg-brand" : "bg-line-strong"}`} />
              {/* En móvil solo se nombra el paso actual (los seis nombres no caben); desde sm se muestran todos. */}
              <span className={`hidden text-[12px] leading-tight sm:block ${now ? "font-extrabold text-ink" : done ? "font-bold text-ink-2" : "font-semibold text-muted"}`}>{s}</span>
              <span className="sr-only">{done ? `Completado: ${s}` : now ? `Paso actual: ${s}` : `Pendiente: ${s}`}</span>
            </li>
          );
        })}
      </ol>
      <p aria-hidden className="m-0 text-[13.5px] font-extrabold text-ink sm:hidden">{label}</p>
    </div>
  );
}

/** Fila de estado del ticket para el cliente («Solicitud · Pago · Equipo · …»): responde «¿qué falta para continuar?». */
export function StatusRow({ label, value, tone = "neutral" }: { label: string; value: ReactNode; tone?: "ok" | "wait" | "neutral" | "bad" }) {
  const dot = { ok: "bg-ok", wait: "bg-brand", neutral: "bg-line-strong", bad: "bg-danger" }[tone];
  return (
    <li className="flex items-start gap-3 py-2.5 text-[14.5px]">
      <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${dot}`} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-muted">{label}</span>
        <span className="font-bold text-ink">{value}</span>
      </span>
    </li>
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
