import { Alert, SubmitButton } from "@/components/ui/form";
import { Card, money } from "@/components/ui/layout";
import { DIAGNOSIS_CONDITION } from "@/lib/domain/pricing";
import { createClient } from "@/lib/supabase/server";
import { startServicePaymentAction } from "../pay-actions";

const RESULT: Record<string, { tone: "ok" | "error"; text: string }> = {
  exito: { tone: "ok", text: "Gracias. Estamos confirmando tu pago con Mercado Pago; en unos segundos verás el estado actualizado." },
  pendiente: { tone: "ok", text: "Tu pago está pendiente de confirmación. Te avisaremos apenas se acredite." },
  fallo: { tone: "error", text: "El pago no se completó. Puedes intentarlo de nuevo." },
  no_configurado: { tone: "error", text: "El pago en línea todavía no está disponible. Puedes pagar en el local y avisarnos." },
  limite: { tone: "error", text: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." },
  ya_pagado: { tone: "ok", text: "Este cobro ya está pagado." },
  sin_saldo: { tone: "ok", text: "No hay saldo por pagar en esta cotización." },
  no_disponible: { tone: "error", text: "Este pago no está disponible en este momento." },
  error: { tone: "error", text: "No pudimos iniciar el pago. Inténtalo de nuevo en un momento." },
};

/**
 * Pagos del ticket para el cliente: diagnóstico y cotización aprobada. Los importes se leen de la base de datos y el cobro lo
 * recalcula el servidor al iniciarlo; esta tarjeta solo muestra el estado y ofrece el botón.
 */
export async function PaymentCard({ ticketId, result }: { ticketId: string; result?: string }) {
  const supabase = await createClient();
  const [{ data: t }, { data: credit }, { data: quote }] = await Promise.all([
    supabase.from("tickets").select("service_id, service_snapshot, status, modality, prepaid_at").eq("id", ticketId).maybeSingle(),
    supabase.from("diagnosis_credits").select("amount, status").eq("ticket_id", ticketId).maybeSingle(),
    supabase.from("quotes").select("id, code, status, total, paid_at").eq("ticket_id", ticketId).eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!t) return null;
  const { data: svc } = t.service_id ? await supabase.from("services").select("is_diagnostic_fee, base_price, allow_online_payment").eq("id", t.service_id).maybeSingle() : { data: null };
  const { data: flow } = t.service_id ? await supabase.rpc("service_flow", { p_service: t.service_id, p_modality: t.modality }) : { data: null };
  const isDiag = Boolean(svc?.is_diagnostic_fee) && !["cancelled", "delivered"].includes(t.status);
  const diagPrice = (t.service_snapshot as { base_price?: number } | null)?.base_price ?? svc?.base_price ?? null;
  const owesQuote = quote && !quote.paid_at && Number(quote.total) > 0;
  // Servicio de precio fijo (pago inmediato): se paga una sola vez y el importe lo recalcula el servidor.
  const isImmediate = !svc?.is_diagnostic_fee && flow === "immediate" && !t.prepaid_at && Boolean(svc?.allow_online_payment) && Number(diagPrice) > 0 && !quote && !["cancelled", "delivered"].includes(t.status);
  const msg = result ? RESULT[result] : undefined;
  if (!msg && !(isDiag && !credit) && !credit && !quote && !isImmediate && !t.prepaid_at) return null;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="m-0 text-[17px] font-extrabold">Pagos</h2>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {isDiag && !credit && diagPrice ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-[15px] font-bold">
            <span>Diagnóstico</span>
            <span>{money(diagPrice)}</span>
          </div>
          <p className="m-0 text-[13px] leading-snug text-muted">{DIAGNOSIS_CONDITION}</p>
          <form action={startServicePaymentAction}>
            <input type="hidden" name="kind" value="diagnosis" />
            <input type="hidden" name="ticketId" value={ticketId} />
            <input type="hidden" name="ref" value={ticketId} />
            <SubmitButton pendingText="Abriendo Mercado Pago…">Pagar el diagnóstico · {money(diagPrice)}</SubmitButton>
          </form>
        </div>
      ) : null}
      {isImmediate ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-[15px] font-bold">
            <span>Servicio</span>
            <span>{money(diagPrice)}</span>
          </div>
          <form action={startServicePaymentAction}>
            <input type="hidden" name="kind" value="service" />
            <input type="hidden" name="ticketId" value={ticketId} />
            <input type="hidden" name="ref" value={ticketId} />
            <SubmitButton pendingText="Abriendo Mercado Pago…">Pagar el servicio · {money(diagPrice)}</SubmitButton>
          </form>
          <p className="m-0 text-[12px] text-muted">También puedes pagar en el local; el equipo lo registrará.</p>
        </div>
      ) : null}
      {t.prepaid_at ? <p className="m-0 text-[15px] font-semibold">✓ Servicio pagado.</p> : null}
      {credit ? (
        <p className="m-0 text-[15px] font-semibold">
          ✓ Diagnóstico pagado ({money(credit.amount)}).{" "}
          <span className="text-[13px] font-medium text-muted">{credit.status === "applied" ? "Ya se abonó a tu reparación." : "Si apruebas la reparación, se abona a su valor."}</span>
        </p>
      ) : null}
      {quote && owesQuote ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-[15px] font-bold">
            <span>Cotización {quote.code} aprobada</span>
            <span>{money(quote.total)}</span>
          </div>
          <form action={startServicePaymentAction}>
            <input type="hidden" name="kind" value="quote" />
            <input type="hidden" name="ticketId" value={ticketId} />
            <input type="hidden" name="ref" value={quote.id} />
            <SubmitButton pendingText="Abriendo Mercado Pago…">Pagar con Mercado Pago · {money(quote.total)}</SubmitButton>
          </form>
          <p className="m-0 text-[12px] text-muted">También puedes pagar en el local; el equipo lo registrará.</p>
        </div>
      ) : null}
      {quote?.paid_at ? <p className="m-0 text-[15px] font-semibold">✓ Cotización {quote.code} pagada.</p> : null}
    </Card>
  );
}
