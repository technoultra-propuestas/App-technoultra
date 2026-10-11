import type { ReactNode } from "react";
import { Alert, SubmitButton } from "@/components/ui/form";
import { IconClock } from "@/components/ui/icons";
import { Card, money } from "@/components/ui/layout";
import { PaymentTimeline } from "@/components/ui/service-flow";
import { DIAGNOSIS_CONDITION, DIAGNOSIS_SCOPE } from "@/lib/domain/pricing";
import { paymentSteps, whatsNext } from "@/lib/domain/service-stages";
import { derivePaymentUi, PAYMENT_UNKNOWN_MESSAGE, returnMessage, type DbPaymentStatus, type PaymentRow, type PaymentUi } from "@/lib/payments/state";
import { createClient } from "@/lib/supabase/server";
import { startServicePaymentAction } from "../pay-actions";
import { PayStatusCard, type PayVariant } from "./pay-status-card";
import { PendingCard } from "./pending-card";

/** Códigos que devuelve la acción de pago al fallar ANTES de abrir el pago. Ninguno nombra al proveedor. */
const RESULT: Record<string, { tone: "ok" | "error"; text: string }> = {
  no_configurado: { tone: "error", text: "El pago en línea todavía no está disponible. Puedes pagar en el local y avisarnos." },
  limite: { tone: "error", text: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." },
  ya_pagado: { tone: "ok", text: "Pago confirmado." },
  sin_saldo: { tone: "ok", text: "No hay saldo por pagar en esta cotización." },
  no_disponible: { tone: "error", text: "Este pago no está disponible en este momento." },
  error: { tone: "error", text: "No pudimos iniciar el pago. Inténtalo de nuevo en un momento." },
};

type Kind = "diagnosis" | "service" | "quote";

const APPROVED_TEXT: Record<Kind, string> = {
  diagnosis: "Tu pago del diagnóstico está confirmado. Te mantendremos informado sobre los siguientes pasos de tu servicio.",
  service: "Tu pago del servicio está confirmado. Te mantendremos informado sobre los siguientes pasos.",
  quote: "Tu pago de la cotización está confirmado. Seguimos con tu servicio.",
};

/** Qué pasa ahora con el equipo, según la modalidad elegida (solo mientras el servicio apenas comienza). */
function modalityLine(modality: string): string {
  switch (modality) {
    case "home":
      return "Nuestro equipo te contactará para coordinar la visita y continuar con el servicio.";
    case "pickup":
      return "Nuestro equipo te contactará para coordinar la recogida de tu equipo.";
    case "remote":
      return "Un técnico te contactará para iniciar el soporte remoto; no necesitas entregar tu equipo.";
    default:
      return "Nuestro equipo te indicará cómo coordinar la recepción de tu equipo para iniciar el diagnóstico.";
  }
}

/** Un cobro con SU estado: UNA sola tarjeta principal (nunca dos mensajes de estado a la vez). El botón «Pagar» solo aparece si el servidor dice que se puede. */
function PayBlock({ kind, title, amount, refId, ticketId, rows, settled, modality, ticketStatus, note, unknownNotice }: { kind: Kind; title: string; amount: number; refId: string; ticketId: string; rows: PaymentRow[]; settled: boolean; modality: string; ticketStatus: string; note?: string; unknownNotice: boolean }) {
  const ui = derivePaymentUi(rows, settled);
  const latest = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const payForm = (txt: string, variant: "primary" | "dark" = "primary") => (
    <form action={startServicePaymentAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="ref" value={refId} />
      <SubmitButton pendingText="Abriendo el pago…" variant={variant}>
        {txt}
      </SubmitButton>
    </form>
  );
  const amountTxt = money(amount);
  const retry = payForm(`Intentar pagar nuevamente · ${amountTxt}`);
  const help = (
    <a href="/c/ayuda" className="flex min-h-11 items-center justify-center text-[14px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">
      ¿Necesitas ayuda con tu pago?
    </a>
  );
  const card = (variant: PayVariant, cardTitle: string, text: string, state: PaymentUi, children?: ReactNode) => (
    <PayStatusCard variant={variant} title={cardTitle} text={text} concept={title} amount={amountTxt} timeline={<PaymentTimeline steps={paymentSteps(state)} />}>
      {children}
    </PayStatusCard>
  );

  switch (ui.state) {
    case "confirmed":
      return card("approved", "¡Recibimos tu pago!", `${APPROVED_TEXT[kind]}${kind !== "quote" && ticketStatus === "received" ? ` ${modalityLine(modality)}` : ""}`, "confirmed");
    case "validating":
      return (
        <PendingCard ticketId={ticketId} startedAt={latest?.created_at ?? new Date().toISOString()} concept={title} amount={amountTxt}>
          {ui.canResume ? (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-[13px] leading-snug text-ink-2">¿Saliste antes de terminar? Puedes continuar este mismo pago; no se cobra dos veces.</p>
              {payForm("Continuar con el pago", "dark")}
            </div>
          ) : null}
        </PendingCard>
      );
    case "rejected":
    case "expired":
      return card(
        "failed",
        ui.state === "expired" ? "El pago venció" : "No se pudo completar el pago",
        "Puedes intentarlo nuevamente. Si tu banco registró algún movimiento, verifica su estado antes de repetir el pago.",
        ui.state,
        <>
          {retry}
          {help}
        </>,
      );
    case "cancelled":
      return card("unknown", "Cancelaste el pago", "Cuando quieras, puedes intentarlo nuevamente. Si tu banco registró algún movimiento, verifica su estado antes de repetir el pago.", "cancelled", retry);
    case "refunded":
      return card("unknown", "Pago reembolsado", "Este pago fue reembolsado.", "refunded");
    default:
      return (
        <PayStatusCard
          variant={unknownNotice ? "unknown" : "none"}
          title={unknownNotice ? "No pudimos verificar el estado de tu pago" : "Pago pendiente"}
          text={unknownNotice ? PAYMENT_UNKNOWN_MESSAGE : kind === "diagnosis" ? "Paga el diagnóstico para que podamos empezar con tu servicio." : "Realiza el pago para continuar con tu servicio."}
          concept={title}
          amount={amountTxt}
        >
          {payForm(`Pagar · ${amountTxt}`)}
          {note ? <p className="m-0 text-[12.5px] text-muted">{note}</p> : null}
        </PayStatusCard>
      );
  }
}

/**
 * Pagos del ticket para el cliente: diagnóstico, servicio de precio fijo y cotización aprobada. Importes y estados se leen de la base de
 * datos (RLS) y el cobro lo recalcula el servidor al iniciarlo; esta tarjeta nunca decide si algo está pagado.
 */
export async function PaymentCard({ ticketId, result }: { ticketId: string; result?: string }) {
  const supabase = await createClient();
  const [{ data: t }, { data: credit }, { data: quote }, { data: pays }, { count: receptions }, { data: diag }] = await Promise.all([
    supabase.from("tickets").select("service_id, service_snapshot, status, modality, prepaid_at").eq("id", ticketId).maybeSingle(),
    supabase.from("diagnosis_credits").select("amount, status").eq("ticket_id", ticketId).maybeSingle(),
    supabase.from("quotes").select("id, code, status, total, paid_at").eq("ticket_id", ticketId).eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("payments").select("purpose, quote_id, status, provider, created_at").eq("ticket_id", ticketId),
    supabase.from("receptions").select("id", { count: "exact", head: true }).eq("ticket_id", ticketId),
    supabase.from("diagnostics").select("finalized_at").eq("ticket_id", ticketId).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!t) return null;
  const { data: svc } = t.service_id ? await supabase.from("services").select("is_diagnostic_fee, base_price, allow_online_payment").eq("id", t.service_id).maybeSingle() : { data: null };
  const { data: flow } = t.service_id ? await supabase.rpc("service_flow", { p_service: t.service_id, p_modality: t.modality }) : { data: null };
  const closed = ["cancelled", "delivered"].includes(t.status);
  const price = (t.service_snapshot as { base_price?: number } | null)?.base_price ?? svc?.base_price ?? null;
  const rowsOf = (purpose: string, quoteId?: string): PaymentRow[] =>
    (pays ?? []).filter((p) => p.purpose === purpose && (purpose !== "quote" || p.quote_id === quoteId)).map((p) => ({ status: p.status as DbPaymentStatus, provider: p.provider, created_at: p.created_at }));

  const isDiag = Boolean(svc?.is_diagnostic_fee);
  const isImmediate = !isDiag && flow === "immediate" && Boolean(svc?.allow_online_payment);
  const showDiag = isDiag && Number(price) > 0 && (!closed || Boolean(credit));
  const showService = isImmediate && Number(price) > 0 && !quote && (!closed || Boolean(t.prepaid_at));
  const showQuote = Boolean(quote) && Number(quote?.total) > 0;
  // Errores de la acción de pago (antes de abrir el pago). El resultado del pago NO sale de la URL: sale de la base de datos.
  const msg = result ? RESULT[result] : undefined;
  if (!msg && !showDiag && !showService && !showQuote) return null;

  const mainRows = showDiag ? rowsOf("diagnosis") : showService ? rowsOf("service") : showQuote && quote ? rowsOf("quote", quote.id) : [];
  const mainSettled = showDiag ? Boolean(credit) : showService ? Boolean(t.prepaid_at) : Boolean(quote?.paid_at);
  const mainState: PaymentUi = derivePaymentUi(mainRows, mainSettled).state;
  // «Regresaste del pago sin ningún pago verificable»: único caso en que la URL influye (y solo para decir que no se pudo verificar).
  const unknownNotice = result === "fallo" && returnMessage(result, mainState) !== null;
  const next = whatsNext({ pay: mainState, ticketStatus: t.status, modality: t.modality, hasReception: (receptions ?? 0) > 0, diagnosisReady: Boolean(diag?.finalized_at) });
  // La frase de modalidad ya está dentro de la tarjeta de pago confirmado: no se repite mientras el servicio apenas comienza.
  const showNext = next && !(mainState === "confirmed" && t.status === "received");

  return (
    <Card id="pago" className="flex flex-col gap-4">
      <h2 className="m-0 text-[17px] font-extrabold">Pago</h2>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {showDiag ? (
        <>
          <PayBlock kind="diagnosis" title="Diagnóstico técnico" amount={Number(price)} refId={ticketId} ticketId={ticketId} rows={rowsOf("diagnosis")} settled={Boolean(credit)} modality={t.modality} ticketStatus={t.status} unknownNotice={unknownNotice} note="También puedes pagar en el local; el equipo lo registrará." />
          <details className="rounded-[14px] border border-line bg-paper p-3.5 text-[13.5px] leading-snug text-ink-2" open={mainState === "none"}>
            <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-extrabold text-ink">Qué incluye y cómo se aplica el diagnóstico</summary>
            <p className="m-0 mb-2">{DIAGNOSIS_SCOPE}</p>
            <p className="m-0">{DIAGNOSIS_CONDITION}</p>
          </details>
        </>
      ) : null}
      {showService ? <PayBlock kind="service" title="Servicio" amount={Number(price)} refId={ticketId} ticketId={ticketId} rows={rowsOf("service")} settled={Boolean(t.prepaid_at)} modality={t.modality} ticketStatus={t.status} unknownNotice={unknownNotice} note="También puedes pagar en el local; el equipo lo registrará." /> : null}
      {showQuote && quote ? <PayBlock kind="quote" title={`Cotización ${quote.code}`} amount={Number(quote.total)} refId={quote.id} ticketId={ticketId} rows={rowsOf("quote", quote.id)} settled={Boolean(quote.paid_at)} modality={t.modality} ticketStatus={t.status} unknownNotice={unknownNotice} note="También puedes pagar en el local; el equipo lo registrará." /> : null}
      {showNext ? (
        <div className="flex items-start gap-3 rounded-[14px] bg-paper p-3.5">
          <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-ink">
            <IconClock width={20} height={20} />
          </span>
          <div className="flex flex-col">
            <span className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-muted">¿Qué sigue?</span>
            <span className="text-[14.5px] font-bold leading-snug text-ink">{next}</span>
          </div>
        </div>
      ) : null}
      {showDiag && credit ? <p className="m-0 text-[13px] font-medium text-muted">{credit.status === "applied" ? "El valor del diagnóstico ya se abonó a tu reparación." : "Si apruebas la reparación, el valor del diagnóstico se abona a su costo."}</p> : null}
    </Card>
  );
}
