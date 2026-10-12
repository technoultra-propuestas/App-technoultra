import type { ReactNode } from "react";
import { IconChevronDown } from "@/components/ui/icons";

/**
 * Acordeón nativo (<details>/<summary>): accesible con teclado y lector de pantalla sin JavaScript. Cerrado por defecto; la flecha
 * gira con una transición corta que se desactiva con `prefers-reduced-motion`. Abrirlo no dispara consultas ni llamadas de IA:
 * el contenido ya viene renderizado del servidor.
 */
export function Accordion({
  title,
  icon,
  badge,
  meta,
  children,
  defaultOpen = false,
  className = "",
  id,
}: {
  title: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <details id={id} open={defaultOpen} className={`group rounded-card border border-line bg-white shadow-card ${className}`}>
      <summary className="flex min-h-[60px] cursor-pointer list-none items-center gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
        {icon ? <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-paper text-ink">{icon}</span> : null}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[16px] font-extrabold leading-tight tracking-[-0.01em]">{title}</span>
          {meta ? <span className="text-[12.5px] font-semibold text-muted">{meta}</span> : null}
        </span>
        {badge}
        <IconChevronDown aria-hidden width={20} height={20} className="flex-none text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="border-t border-line px-5 pb-5 pt-4">{children}</div>
    </details>
  );
}

/** Fila desplegable compacta dentro de una lista (p. ej. «¿Cómo va tu servicio?»). */
export function AccordionRow({ icon, label, value, tone = "neutral", children }: { icon: ReactNode; label: string; value: string; tone?: "ok" | "wait" | "neutral" | "bad"; children: ReactNode }) {
  const dot = { ok: "bg-ok-soft text-ok", wait: "bg-[#FFF0DD] text-[#7A3E00]", neutral: "bg-paper text-muted", bad: "bg-danger-soft text-danger" }[tone];
  const mark = { ok: "Completado", wait: "En curso", neutral: "Pendiente", bad: "Requiere atención" }[tone];
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden">
          <span aria-hidden className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${dot}`}>{icon}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-muted">{label}</span>
            <span className="text-[14.5px] font-bold text-ink">
              {value}
              <span className="sr-only"> ({mark})</span>
            </span>
          </span>
          <IconChevronDown aria-hidden width={18} height={18} className="flex-none text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="pb-3 pl-12 pr-1 text-[13.5px] leading-snug text-ink-2">{children}</div>
      </details>
    </li>
  );
}
