import type { ReactNode } from "react";
import { IconCard, IconCheck, IconClock, IconDoc, IconGear, IconPackage, IconTool, IconXCircle, IconAlert } from "@/components/ui/icons";
import type { PayStep, Stage, StageKey } from "@/lib/domain/service-stages";

/** Componentes sin estado (sirven en servidor y en cliente): línea de tiempo general del servicio y línea de tiempo del pago. */

const STAGE_ICON: Record<StageKey, ReactNode> = {
  request: <IconDoc width={20} height={20} />,
  payment: <IconCard width={20} height={20} />,
  diagnosis: <IconTool width={20} height={20} />,
  quote: <IconDoc width={20} height={20} />,
  repair: <IconGear width={20} height={20} />,
  delivery: <IconPackage width={20} height={20} />,
};

const dayFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });
const shortDate = (iso: string | null) => (iso ? dayFmt.format(new Date(iso)) : "");

/**
 * Línea de tiempo general, horizontal y con íconos. En móvil se desplaza con el dedo si los nombres no caben (cada etapa mide ≥ 68 px);
 * desde `md` ocupa todo el ancho. Completado = marca; actual = naranja; pendiente = neutro.
 */
export function ServiceTimeline({ stages }: { stages: Stage[] }) {
  const current = stages.find((s) => s.state === "current");
  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]" tabIndex={0} role="group" aria-label="Avance del servicio (desliza para ver todas las etapas)">
        <ol className="m-0 grid list-none gap-0 p-0" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(68px, 1fr))` }}>
          {stages.map((s, i) => (
            <li key={s.key} aria-current={s.state === "current" ? "step" : undefined} className="relative flex flex-col items-center gap-1.5 px-0.5 text-center">
              {i > 0 ? <span aria-hidden className={`absolute left-[-50%] right-[50%] top-[18px] h-0.5 ${s.state === "pending" ? "bg-line-strong" : "bg-brand"}`} /> : null}
              <span
                className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                  s.state === "done" ? "border-ok bg-ok text-white" : s.state === "current" ? "border-brand bg-brand text-ink" : "border-line-strong bg-white text-muted"
                }`}
              >
                {s.state === "done" ? <IconCheck width={18} height={18} strokeWidth={3} /> : STAGE_ICON[s.key]}
              </span>
              <span className={`text-[12px] leading-tight ${s.state === "pending" ? "font-semibold text-muted" : "font-extrabold text-ink"}`}>{s.label}</span>
              <span className="min-h-[14px] text-[11px] font-semibold text-muted">{s.state === "done" ? shortDate(s.at) : s.state === "current" ? "En curso" : "Pendiente"}</span>
              <span className="sr-only">{s.state === "done" ? "Completado" : s.state === "current" ? "Etapa actual" : "Pendiente"}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="m-0 text-[13px] font-semibold text-muted sm:hidden">{current ? `Ahora: ${current.label}` : stages.every((s) => s.state === "done") ? "Servicio completado" : ""}</p>
    </div>
  );
}

/** Línea de tiempo del PAGO (independiente de la del servicio): iniciado → en validación → confirmado, o el resultado real. */
export function PaymentTimeline({ steps }: { steps: PayStep[] }) {
  const icon = (s: PayStep) => {
    if (s.state === "failed") return <IconXCircle width={18} height={18} />;
    if (s.state === "unknown") return <IconAlert width={18} height={18} />;
    if (s.state === "done" && s.key !== "started") return <IconCheck width={18} height={18} strokeWidth={3} />;
    return s.key === "started" ? <IconCard width={18} height={18} /> : s.key === "validating" ? <IconClock width={18} height={18} /> : <IconCheck width={18} height={18} strokeWidth={3} />;
  };
  const tone = (s: PayStep) =>
    s.state === "done" ? "border-ok bg-ok text-white" : s.state === "current" ? "border-brand bg-brand text-ink" : s.state === "failed" ? "border-danger bg-danger text-white" : s.state === "unknown" ? "border-line-strong bg-paper text-ink-2" : "border-line-strong bg-white text-muted";
  return (
    <ol aria-label="Etapas del pago" className="m-0 grid list-none grid-cols-3 gap-0 p-0">
      {steps.map((s, i) => (
        <li key={s.key} aria-current={s.state === "current" ? "step" : undefined} className="relative flex flex-col items-center gap-1 px-0.5 text-center">
          {i > 0 ? <span aria-hidden className={`absolute left-[-50%] right-[50%] top-4 h-0.5 ${s.state === "pending" ? "bg-line-strong" : s.state === "failed" ? "bg-danger" : "bg-ok"}`} /> : null}
          <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${tone(s)}`}>{icon(s)}</span>
          <span className={`text-[12px] leading-tight ${s.state === "pending" ? "font-semibold text-muted" : "font-extrabold text-ink"}`}>{s.label}</span>
          <span className="sr-only">{s.state === "done" ? "Completado" : s.state === "current" ? "Etapa actual" : s.state === "failed" ? "No se completó" : s.state === "unknown" ? "Sin verificar" : "Pendiente"}</span>
        </li>
      ))}
    </ol>
  );
}
