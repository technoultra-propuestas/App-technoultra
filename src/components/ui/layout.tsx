import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em] lg:text-[30px]">{title}</h1>
        <div className="h-1 w-10 rounded-sm bg-brand" />
        {subtitle ? (
          <p className="m-0 mt-1 max-w-[640px] text-base leading-normal text-muted">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return <div id={id} className={`scroll-mt-24 rounded-card border border-line bg-white p-5 shadow-card ${className}`}>{children}</div>;
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-start gap-2">
      <div className="text-[18px] font-extrabold">{title}</div>
      {text ? <p className="m-0 text-[15px] leading-normal text-muted">{text}</p> : null}
      {action}
    </Card>
  );
}

const buttonBase =
  "press inline-flex min-h-[52px] items-center justify-center rounded-2xl px-5 text-[16px] font-extrabold no-underline";
export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: "primary" | "ghost" | "dark" }) {
  const v =
    variant === "primary"
      ? "bg-brand text-ink"
      : variant === "dark"
        ? "bg-ink text-white"
        : "border-[1.5px] border-line-strong bg-white text-ink";
  return <Link {...props} className={`${buttonBase} ${v} ${className}`} />;
}

export function Select({
  label,
  name,
  children,
  error,
  ...rest
}: { label: string; name: string; error?: string } & ComponentProps<"select">) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-[15px] font-bold">
      {label}
      <select
        name={name}
        aria-invalid={error ? true : undefined}
        className="h-14 w-full min-w-0 rounded-ctl border-[1.5px] border-line-strong bg-white px-4 text-[17px] font-semibold text-ink"
        {...rest}
      >
        {children}
      </select>
      {error ? <span className="text-[13px] font-bold text-[#9A2B1E]">{error}</span> : null}
    </label>
  );
}

export function Textarea({
  label,
  name,
  error,
  ...rest
}: { label: string; name: string; error?: string } & ComponentProps<"textarea">) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-[15px] font-bold">
      {label}
      <textarea
        name={name}
        aria-invalid={error ? true : undefined}
        rows={4}
        className="w-full min-w-0 rounded-ctl border-[1.5px] border-line-strong bg-white px-4 py-3 text-[17px] font-semibold text-ink"
        {...rest}
      />
      {error ? <span className="text-[13px] font-bold text-[#9A2B1E]">{error}</span> : null}
    </label>
  );
}

export const money = (n: number | string | null | undefined) =>
  "$" + Math.round(Number(n ?? 0)).toLocaleString("es-CO");

const STATUS: Record<string, { label: string; cls: string }> = {
  // «Recibido» ya no existe como palabra suelta: se refería a la solicitud, al dinero o al equipo. Ver lib/domain/ticket-flow.ts.
  received: { label: "Solicitud recibida", cls: "bg-[#EEF1F6] text-[#33507A]" },
  requested: { label: "Solicitud recibida", cls: "bg-[#EEF1F6] text-[#33507A]" },
  equipment_received: { label: "Equipo recibido", cls: "bg-[#E3F3E8] text-[#1F6B3A]" },
  diagnosing: { label: "En diagnóstico", cls: "bg-[#FBF1D9] text-[#6E4B00]" },
  awaiting_approval: { label: "Esperando aprobación", cls: "bg-[#FFE9CC] text-[#7A3E00]" },
  // Pago (dimensión distinta del estado físico del equipo).
  awaiting_part: { label: "Esperando repuesto", cls: "bg-[#EDEDEA] text-ink-2" },
  in_service: { label: "En servicio", cls: "bg-ink text-[#FFB255]" },
  testing: { label: "En pruebas", cls: "bg-[#ECEBFA] text-[#3F3A8C]" },
  ready: { label: "Listo para entregar", cls: "bg-[#E3F3E8] text-[#1F6B3A]" },
  delivered: { label: "Entregado", cls: "bg-[#E3F3E8] text-[#1F6B3A]" },
  cancelled: { label: "Cancelado", cls: "bg-[#F7E4E1] text-[#9A2B1E]" },
  pending: { label: "Pendiente", cls: "bg-[#FBF1D9] text-[#6E4B00]" },
  scheduled: { label: "Agendada", cls: "bg-[#EEF1F6] text-[#33507A]" },
  converted: { label: "En proceso", cls: "bg-[#E3F3E8] text-[#1F6B3A]" },
  rejected: { label: "Rechazada", cls: "bg-[#F7E4E1] text-[#9A2B1E]" },
};
export const statusLabel = (s: string) => STATUS[s]?.label ?? s;
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-[#EDEDEA] text-ink-2" };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[13px] font-extrabold ${s.cls}`}>
      {s.label}
    </span>
  );
}

export const MODALITY_LABEL: Record<string, string> = {
  store: "Llevar al local",
  pickup: "Recogida a domicilio",
  home: "Servicio a domicilio",
  remote: "Soporte remoto",
};
export const EQUIPMENT_LABEL: Record<string, string> = {
  laptop: "Portátil",
  desktop: "Escritorio",
  all_in_one: "Todo en uno",
  printer: "Impresora",
  network: "Red / router",
  other: "Otro",
};
export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  });
export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });
