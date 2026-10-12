import type { ReactNode } from "react";
import { SubmitButton } from "@/components/ui/form";
import { IconCard, IconCheckCircle, IconPackageCheck, IconShieldCheck, IconWallet } from "@/components/ui/icons";
import { money } from "@/components/ui/layout";
import { getContactWindowText } from "@/lib/settings/contact-window";
import { paymentConfirmedText } from "@/lib/domain/ticket-flow";
import { balanceOpen, parseQuoteSummary, PLAN_LABEL, quotePayStage, type QuotePlan } from "@/lib/payments/quote-plan";
import { createClient } from "@/lib/supabase/server";
import { startQuotePaymentAction } from "../pay-actions";
import { PendingCard } from "./pending-card";

function PayForm({ ticketId, quoteId, plan, children, variant = "primary" }: { ticketId: string; quoteId: string; plan: QuotePlan; children: ReactNode; variant?: "primary" | "dark" }) {
  return (
    <form action={startQuotePaymentAction}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="plan" value={plan} />
      <SubmitButton pendingText="Abriendo el pago…" variant={variant} size="md">
        {children}
      </SubmitButton>
    </form>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "ok" | "muted" }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "text-[17px] font-extrabold text-ink" : "text-[14px] font-semibold"} ${tone === "ok" ? "text-ok" : tone === "muted" ? "text-muted" : "text-ink"}`}>
      <span className="min-w-0">{label}</span>
      <span className="flex-none tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Cobro de la cotización aprobada. TODOS los importes salen de `quote_payment_summary` (base de datos): saldo neto del crédito por
 * diagnóstico, anticipo del 50 %, pago total con 5 % de descuento, pagado y saldo. Una sola tarjeta principal según la situación real.
 */
export async function QuotePayPanel({ ticketId, quoteId, withHeader = true, windowText }: { ticketId: string; quoteId: string; withHeader?: boolean; windowText?: string | null }) {
  const supabase = await createClient();
  const [{ data }, win] = await Promise.all([supabase.rpc("quote_payment_summary", { p_quote: quoteId }), windowText === undefined ? getContactWindowText() : Promise.resolve(windowText)]);
  const contact = win;
  const s = parseQuoteSummary(data);
  if (!s || s.status !== "approved") return null;
  const stage = quotePayStage(s);
  const summary = (
    <div className="flex flex-col gap-1.5 rounded-[14px] border border-line bg-white p-3.5">
      <Row label="Valor de la cotización" value={money(s.items_total)} />
      {s.diagnosis_credit > 0 ? <Row label="Crédito por diagnóstico (ya pagado)" value={`− ${money(s.diagnosis_credit)}`} tone="ok" /> : null}
      <Row label="Pendiente de pago" value={money(s.base)} strong />
    </div>
  );

  if (stage === "nothing") {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-[#9FD0B0] bg-ok-soft p-4">
        <span className="flex items-center gap-2 text-[16px] font-extrabold text-ok"><IconCheckCircle width={22} height={22} /> No hay saldo por pagar</span>
        <p className="m-0 text-[14px] text-ink-2">El crédito por diagnóstico cubre esta cotización.</p>
      </div>
    );
  }

  if (stage === "choose") {
    return (
      <section aria-label="Elige cómo pagar" className="flex flex-col gap-3">
        {withHeader ? (
          <div className="flex flex-col gap-1 rounded-card border border-[#9FD0B0] bg-ok-soft p-4">
            <span className="flex items-center gap-2 text-[18px] font-extrabold text-ok"><IconCheckCircle width={24} height={24} /> ¡Cotización aprobada!</span>
            <p className="m-0 text-[14px] leading-snug text-ink-2">Gracias por aprobar tu cotización. Elige cómo deseas realizar el pago para que podamos comenzar tu servicio.</p>
            <p className="m-0 text-[12.5px] font-semibold text-muted">Cotización {s.code} · versión {s.version} · Aprobada</p>
          </div>
        ) : null}
        {summary}
        <div className="grid gap-3 md:grid-cols-2">
          <article className="flex flex-col gap-2 rounded-card border border-line bg-white p-3.5">
            <span className="flex items-center gap-2 text-[15px] font-extrabold"><IconWallet width={20} height={20} /> Pagar el 50 % de anticipo</span>
            <span className="text-[22px] font-extrabold leading-none tabular-nums">{money(s.deposit_amount)}</span>
            <p className="m-0 text-[13px] leading-snug text-ink-2">Paga el 50 % para programar el inicio del servicio. El saldo restante se paga antes de la entrega del equipo.</p>
            <div className="flex flex-col gap-0.5 rounded-[10px] bg-paper px-3 py-2">
              <Row label="Total pendiente" value={money(s.base)} />
              <Row label="Saldo restante" value={money(s.deposit_remaining)} />
            </div>
            <PayForm ticketId={ticketId} quoteId={quoteId} plan="deposit" variant="dark">{`Pagar anticipo · ${money(s.deposit_amount)}`}</PayForm>
          </article>
          <article className="flex flex-col gap-2 rounded-card border-2 border-brand bg-white p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[15px] font-extrabold"><IconCard width={20} height={20} /> Pagar el 100 % y ahorrar un 5 %</span>
              <span className="rounded-full bg-[#FFF6E8] px-2.5 py-0.5 text-[12px] font-extrabold text-ink">Ahorra el 5 %</span>
            </div>
            <span className="text-[22px] font-extrabold leading-none tabular-nums">{money(s.full_amount)}</span>
            <p className="m-0 text-[13px] leading-snug text-ink-2">Paga el total por anticipado y ahorra un 5 %.</p>
            <div className="flex flex-col gap-0.5 rounded-[10px] bg-paper px-3 py-2">
              <Row label="Saldo antes del descuento" value={money(s.base)} />
              <Row label="Descuento del 5 %" value={`− ${money(s.full_discount)}`} tone="ok" />
            </div>
            <PayForm ticketId={ticketId} quoteId={quoteId} plan="full">{`Pagar total con 5 % de descuento · ${money(s.full_amount)}`}</PayForm>
            <p className="m-0 text-center text-[13px] font-bold text-ok">Con esta opción ahorras {money(s.full_discount)} COP</p>
          </article>
        </div>
      </section>
    );
  }

  if (stage === "validating") {
    const plan = (s.pending_plan ?? "full") as QuotePlan;
    return (
      <div className="flex flex-col gap-3">
        {summary}
        <PendingCard ticketId={ticketId} startedAt={s.pending_since ?? new Date().toISOString()} concept={PLAN_LABEL[plan]} amount={money(s.pending_amount ?? 0)}>
          {s.pending_provider === "manual" ? <p className="m-0 text-[13px] text-ink-2">Registramos tu pago en el local; nuestro equipo lo está validando.</p> : null}
        </PendingCard>
      </div>
    );
  }

  if (stage === "deposit_paid") {
    const open = balanceOpen(s);
    return (
      <div className="flex flex-col gap-3 rounded-card border border-line bg-white p-4">
        <span className="flex items-center gap-2 text-[17px] font-extrabold text-ok"><IconShieldCheck width={22} height={22} /> Anticipo confirmado</span>
        <p className="m-0 text-[13.5px] text-ink-2">{paymentConfirmedText({ kind: "quote", modality: "", ticketStatus: s.ticket_status ?? "", windowText: contact, plan: "deposit" })}</p>
        <div className="flex flex-col gap-1">
          <Row label="Pendiente de pago" value={money(s.base)} />
          <Row label="Pagado" value={money(s.paid)} tone="ok" />
          <Row label="Saldo restante" value={money(s.balance)} strong />
        </div>
        {open ? (
          <PayForm ticketId={ticketId} quoteId={quoteId} plan="balance">{`Pagar saldo restante · ${money(s.balance)}`}</PayForm>
        ) : (
          <p className="m-0 rounded-[12px] bg-paper p-3 text-[13.5px] text-ink-2">El saldo restante se paga al finalizar la reparación, antes de la entrega de tu equipo. Te avisaremos.</p>
        )}
      </div>
    );
  }

  // paid
  return (
    <div className="flex flex-col gap-2 rounded-card border border-[#9FD0B0] bg-ok-soft p-4">
      <span className="flex items-center gap-2 text-[17px] font-extrabold text-ok"><IconPackageCheck width={22} height={22} /> Pago completo confirmado</span>
      <div className="flex flex-col gap-1">
        {s.discount > 0 ? <Row label="Descuento por pago anticipado (5 %)" value={`− ${money(s.discount)}`} tone="ok" /> : null}
        <Row label="Pagado" value={money(s.paid)} />
        <Row label="Saldo pendiente" value={money(0)} strong />
      </div>
      <p className="m-0 text-[13.5px] text-ink-2">{paymentConfirmedText({ kind: "quote", modality: "", ticketStatus: s.ticket_status ?? "", windowText: contact, plan: s.plan === "full" ? "full" : "balance" })}</p>
    </div>
  );
}
