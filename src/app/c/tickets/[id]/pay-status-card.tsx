import type { ReactNode } from "react";
import { IconAlert, IconCheckCircle, IconClock, IconXCircle, IconCard } from "@/components/ui/icons";

export type PayVariant = "none" | "pending" | "approved" | "failed" | "unknown";

const STYLE: Record<PayVariant, { box: string; icon: string; title: string }> = {
  none: { box: "border-line bg-white", icon: "bg-paper text-ink", title: "text-ink" },
  pending: { box: "border-[#E8C48A] bg-warn-soft", icon: "bg-white text-warn", title: "text-warn" },
  approved: { box: "border-[#9FD0B0] bg-ok-soft", icon: "bg-white text-ok", title: "text-ok" },
  failed: { box: "border-[#E5B3AC] bg-danger-soft", icon: "bg-white text-danger", title: "text-danger" },
  unknown: { box: "border-line-strong bg-paper", icon: "bg-white text-ink-2", title: "text-ink" },
};

const ICON: Record<PayVariant, ReactNode> = {
  none: <IconCard width={30} height={30} />,
  pending: <IconClock width={30} height={30} />,
  approved: <IconCheckCircle width={30} height={30} />,
  failed: <IconXCircle width={30} height={30} />,
  unknown: <IconAlert width={30} height={30} />,
};

/** Tarjeta ÚNICA del estado del pago: ícono grande, título, explicación, importe, línea de tiempo del pago y la acción. Sin estado propio. */
export function PayStatusCard({ variant, title, text, concept, amount, timeline, notice, children }: { variant: PayVariant; title: string; text?: string; concept: string; amount: string; timeline?: ReactNode; notice?: ReactNode; children?: ReactNode }) {
  const s = STYLE[variant];
  return (
    <div className={`flex flex-col gap-3.5 rounded-card border p-4 sm:p-5 ${s.box}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl ${s.icon}`}>{ICON[variant]}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 role={variant === "failed" || variant === "unknown" ? "alert" : "status"} className={`m-0 text-[18px] font-extrabold leading-tight ${s.title}`}>{title}</h3>
          {text ? <p className="m-0 text-[14.5px] leading-snug text-ink-2">{text}</p> : null}
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-3 border-y border-black/10 py-2 text-ink">
        <span className="text-[14px] font-bold">{concept}</span>
        <span className="text-[20px] font-extrabold">{amount}</span>
      </div>
      {timeline}
      {notice}
      {children}
    </div>
  );
}
