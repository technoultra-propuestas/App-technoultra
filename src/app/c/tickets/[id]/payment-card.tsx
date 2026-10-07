import { Alert, SubmitButton } from "@/components/ui/form";
import { Card, money } from "@/components/ui/layout";
import { paidNextStep } from "@/lib/domain/ticket-flow";
import { DIAGNOSIS_CONDITION } from "@/lib/domain/pricing";
import { derivePaymentUi, PAYMENT_LABEL, PAYMENT_MESSAGE, returnMessage, type DbPaymentStatus, type PaymentRow } from "@/lib/payments/state";
import { createClient } from "@/lib/supabase/server";
import { startServicePaymentAction } from "../pay-actions";

/** Códigos que devuelve la acción de pago. Ninguno nombra al proveedor de pagos. */
const RESULT: Record<string, { tone: "ok" | "error"; text: string }> = {
  no_configurado: { tone: "error", text: "El pago en línea todavía no está disponible. Puedes pagar en el local y avisarnos." },
  limite: { tone: "error", text: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." },
  ya_pagado: { tone: "ok", text: "Pago confirmado." },
  sin_saldo: { tone: "ok", text: "No hay saldo por pagar en esta cotización." },
  no_disponible: { tone: "error", text: "Este pago no está disponible en este momento." },
  error: { tone: "error", text: "No pudimos iniciar el pago. Inténtalo de nuevo en un momento." },
};

type Kind = "diagnosis" | "service" | "quote";

/** Un cobro (diagnóstico, servicio o cotización) con su estado. El botón «Pagar» solo aparece si el servidor dice que se puede pagar. */
function PayBlock({ kind, title, amount, refId, ticketId, rows, settled, modality, note, bodyNote }: { kind: Kind; title: string; amount: number; refId: string; ticketId: string; rows: PaymentRow[]; settled: boolean; modality: string; note?: string; bodyNote?: string }) {
  const ui = derivePaymentUi(rows, settled);
  const label = (txt: string, pending?: boolean) => (
    <form action={startServicePaymentAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="ref" value={refId} />
      <SubmitButton pendingText="Abriendo el pago…" variant={pending ? "dark" : "primary"}>
        {txt}
      </SubmitButton>
    </form>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-[15px] font-bold">
        <span>{title}</span>
        <span>{money(amount)}</span>
      </div>
      {ui.state === "confirmed" ? (
        <div className="flex flex-col gap-1 rounded-[14px] bg-ok-soft p-3.5 text-ok">
          <span className="text-[15px] font-extrabold">✓ {PAYMENT_LABEL.confirmed}</span>
          {kind !== "quote" ? <span className="text-[14px] font-semibold leading-snug">{paidNextStep(modality)}</span> : null}
        </div>
      ) : null}
      {ui.state === "validating" ? (
        <div className="flex flex-col gap-2 rounded-[14px] bg-warn-soft p-3.5 text-warn">
          <span className="text-[15px] font-extrabold">{PAYMENT_LABEL.validating}</span>
          <span className="text-[14px] font-semibold leading-snug">{PAYMENT_MESSAGE.validating}</span>
        </div>
      ) : null}
      {ui.state === "validating" && ui.canResume ? (
        <details className="text-[13px] text-muted">
          <summary className="flex min-h-11 cursor-pointer items-center font-bold">¿No terminaste de pagar?</summary>
          <div className="flex flex-col gap-2 pb-1">
            <p className="m-0">Puedes continuar el mismo pago sin que se cobre dos veces.</p>
            {label("Continuar con el pago", true)}
          </div>
        </details>
      ) : null}
      {(ui.state === "rejected" || ui.state === "expired" || ui.state === "refunded") && PAYMENT_MESSAGE[ui.state] ? <Alert tone={ui.state === "refunded" ? "ok" : "error"}>{PAYMENT_MESSAGE[ui.state]}</Alert> : null}
      {ui.canPay ? (
        <>
          {bodyNote ? <p className="m-0 text-[13px] leading-snug text-muted">{bodyNote}</p> : null}
          {label(ui.state === "none" ? `Pagar · ${money(amount)}` : `Pagar de nuevo · ${money(amount)}`)}
          {note ? <p className="m-0 text-[12px] text-muted">{note}</p> : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Pagos del ticket para el cliente: diagnóstico, servicio de precio fijo y cotización aprobada. Importes y estados se leen de la base de
 * datos (RLS) y el cobro lo recalcula el servidor al iniciarlo; esta tarjeta nunca decide si algo está pagado.
 */
export async function PaymentCard({ ticketId, result }: { ticketId: string; result?: string }) {
  const supabase = await createClient();
  const [{ data: t }, { data: credit }, { data: quote }, { data: pays }] = await Promise.all([
    supabase.from("tickets").select("service_id, service_snapshot, status, modality, prepaid_at").eq("id", ticketId).maybeSingle(),
    supabase.from("diagnosis_credits").select("amount, status").eq("ticket_id", ticketId).maybeSingle(),
    supabase.from("quotes").select("id, code, status, total, paid_at").eq("ticket_id", ticketId).eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("payments").select("purpose, quote_id, status, provider, created_at").eq("ticket_id", ticketId),
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
  const msg = returnMessage(result) ?? (result ? RESULT[result] : undefined);
  if (!msg && !showDiag && !showService && !showQuote) return null;
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="m-0 text-[17px] font-extrabold">Pago</h2>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {showDiag ? (
        <PayBlock kind="diagnosis" title="Diagnóstico" amount={Number(price)} refId={ticketId} ticketId={ticketId} rows={rowsOf("diagnosis")} settled={Boolean(credit)} modality={t.modality} bodyNote={DIAGNOSIS_CONDITION} note="También puedes pagar en el local; el equipo lo registrará." />
      ) : null}
      {showService ? <PayBlock kind="service" title="Servicio" amount={Number(price)} refId={ticketId} ticketId={ticketId} rows={rowsOf("service")} settled={Boolean(t.prepaid_at)} modality={t.modality} note="También puedes pagar en el local; el equipo lo registrará." /> : null}
      {showQuote && quote ? (
        <PayBlock kind="quote" title={`Cotización ${quote.code}`} amount={Number(quote.total)} refId={quote.id} ticketId={ticketId} rows={rowsOf("quote", quote.id)} settled={Boolean(quote.paid_at)} modality={t.modality} note="También puedes pagar en el local; el equipo lo registrará." />
      ) : null}
      {showDiag && credit ? <p className="m-0 text-[13px] font-medium text-muted">{credit.status === "applied" ? "El valor del diagnóstico ya se abonó a tu reparación." : "Si apruebas la reparación, el valor del diagnóstico se abona a su costo."}</p> : null}
    </Card>
  );
}
