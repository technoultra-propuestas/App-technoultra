import { Card, fmtDateTime, money } from "@/components/ui/layout";
import { DIAGNOSIS_CONDITION } from "@/lib/domain/pricing";
import { methodLabel, staffPaymentView, type StaffPaymentRow } from "@/lib/payments/staff";
import { createClient } from "@/lib/supabase/server";
import { cancelPaymentAction, confirmPaymentAction } from "../payment-actions";
import { ManualPaymentForm } from "./payment-form";

type Concept = { kind: "diagnosis" | "service" | "quote"; refId: string; title: string; amount: number; settled: boolean; note?: string };

const COLS = "id, status, provider, method, amount, reference, note, approved_at, created_at, voucher_evidence_id, purpose, quote_id";

/**
 * Estado real de TODOS los cobros del ticket (diagnóstico, servicio fijo y cotización). El servidor consulta `payments` antes de
 * ofrecer cualquier acción: con un pago confirmado solo se muestra el comprobante del cobro; en validación no se permite duplicar.
 */
export async function PaymentsPanel({ ticketId, role }: { ticketId: string; role: "technician" | "superadmin" }) {
  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("id, service_id, modality, service_snapshot, prepaid_at, status").eq("id", ticketId).maybeSingle();
  if (!t) return null;
  const { data: svc } = t.service_id ? await supabase.from("services").select("is_diagnostic_fee, base_price, allow_online_payment").eq("id", t.service_id).maybeSingle() : { data: null };
  const { data: flow } = t.service_id ? await supabase.rpc("service_flow", { p_service: t.service_id, p_modality: t.modality }) : { data: null };
  const price = Number((t.service_snapshot as { base_price?: number } | null)?.base_price ?? svc?.base_price ?? 0);
  const [{ data: credit }, { data: quote }] = await Promise.all([
    supabase.from("diagnosis_credits").select("amount, status").eq("ticket_id", ticketId).maybeSingle(),
    supabase.from("quotes").select("id, code, total, paid_at").eq("ticket_id", ticketId).eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const concepts: Concept[] = [];
  if (svc?.is_diagnostic_fee && price > 0) concepts.push({ kind: "diagnosis", refId: ticketId, title: "Pago del diagnóstico", amount: price, settled: Boolean(credit), note: DIAGNOSIS_CONDITION });
  else if (svc && !svc.is_diagnostic_fee && price > 0 && (t.prepaid_at || (flow === "immediate" && svc.allow_online_payment))) concepts.push({ kind: "service", refId: ticketId, title: "Pago del servicio", amount: price, settled: Boolean(t.prepaid_at) });
  if (quote && Number(quote.total) > 0) concepts.push({ kind: "quote", refId: quote.id, title: `Pago de la cotización ${quote.code}`, amount: Number(quote.total), settled: Boolean(quote.paid_at) });
  if (!concepts.length) return null;

  const { data: rows } = await supabase
    .from("payments")
    .select(COLS)
    .or(`ticket_id.eq.${ticketId}${quote ? `,quote_id.eq.${quote.id}` : ""}`)
    .order("created_at", { ascending: false });
  const all = (rows ?? []) as unknown as (Omit<StaffPaymentRow, "amount"> & { amount: number | string; purpose: string; quote_id: string | null })[];

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="m-0 text-[17px] font-extrabold">Pagos</h2>
      {concepts.map((c) => {
        const mine = all
          .filter((r) => (c.kind === "quote" ? r.quote_id === c.refId : r.purpose === c.kind && r.quote_id === null))
          .map((r) => ({ ...r, amount: Number(r.amount) }));
        const v = staffPaymentView(mine, c.settled);
        return (
          <div key={c.kind} className="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="m-0 text-[15px] font-extrabold">{c.title}</h3>
              <span className="text-[20px] font-extrabold">{money(c.amount)}</span>
            </div>
            {v.state === "confirmed" ? (
              <div className="flex flex-col gap-0.5 rounded-[12px] bg-[#E3F3E8] p-3 text-[14px] font-semibold text-[#1F6B3A]">
                <span className="font-extrabold">🟢 Pago confirmado</span>
                {v.confirmed ? (
                  <>
                    <span>Método: {methodLabel(v.confirmed.provider, v.confirmed.method)}</span>
                    {v.confirmed.approved_at ? <span>Fecha: {fmtDateTime(v.confirmed.approved_at)}</span> : null}
                    {v.confirmed.reference ? <span>Referencia: {v.confirmed.reference}</span> : null}
                    {v.confirmed.voucher_evidence_id ? <span>Comprobante adjunto</span> : null}
                  </>
                ) : (
                  <span>El cobro figura como pagado.</span>
                )}
              </div>
            ) : null}
            {v.state === "validating" ? (
              <div className="flex flex-col gap-2 rounded-[12px] bg-[#FFF0DD] p-3 text-[14px] font-semibold text-[#7A3E00]">
                <span className="font-extrabold">🟡 Pago en validación</span>
                <span>No se debe registrar manualmente hasta que se confirme.{v.pending ? ` Origen: ${methodLabel(v.pending.provider, v.pending.method)}.` : ""}</span>
                {role === "superadmin" && v.pending ? (
                  <div className="flex flex-wrap items-end gap-2">
                    {v.pendingIsManual ? (
                      <form action={confirmPaymentAction}>
                        <input type="hidden" name="ticketId" value={ticketId} />
                        <input type="hidden" name="paymentId" value={v.pending.id} />
                        <button type="submit" className="min-h-11 rounded-[12px] bg-ink px-4 text-[14px] font-extrabold text-white">Confirmar pago recibido</button>
                      </form>
                    ) : null}
                    <form action={cancelPaymentAction} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                      <input type="hidden" name="ticketId" value={ticketId} />
                      <input type="hidden" name="paymentId" value={v.pending.id} />
                      <input name="reason" required minLength={3} maxLength={200} placeholder="Motivo para anularlo" aria-label="Motivo para anular el intento" className="h-11 min-w-0 flex-1 rounded-[12px] border border-line-strong bg-white px-3 text-[14px] text-ink" />
                      <button type="submit" className="min-h-11 rounded-[12px] border border-line-strong bg-white px-3 text-[13px] font-bold text-[#9A2B1E]">Anular intento</button>
                    </form>
                  </div>
                ) : null}
              </div>
            ) : null}
            {v.state === "none" ? (
              <>
                <div className="rounded-[12px] bg-[#FDE8E4] p-3 text-[14px] font-extrabold text-[#9A2B1E]">🔴 Pago pendiente</div>
                {c.note ? <p className="m-0 text-[13px] text-muted">{c.note}</p> : null}
                <ManualPaymentForm ticketId={ticketId} kind={c.kind} refId={c.refId} amountText={money(c.amount)} />
              </>
            ) : null}
          </div>
        );
      })}
      {credit ? <p className="m-0 border-t border-line pt-3 text-[13px] text-muted">Abono del diagnóstico: {money(credit.amount)} · {credit.status === "applied" ? "aplicado a la reparación" : credit.status === "void" ? "anulado" : "disponible para abonar a la reparación"}.</p> : null}
    </Card>
  );
}
