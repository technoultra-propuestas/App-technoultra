import { Card, money } from "@/components/ui/layout";
import { DIAGNOSIS_CONDITION } from "@/lib/domain/pricing";
import { createClient } from "@/lib/supabase/server";
import { recordDiagnosisPaymentAction } from "../diagnosis-actions";

const STATUS: Record<string, string> = { available: "Disponible para abonar a la reparación", applied: "Aplicado a la reparación", void: "Anulado" };

/** Estado del diagnóstico pagado y su abono. Solo se muestra en tickets de servicios de diagnóstico. */
export async function DiagnosisBox({ ticketId, isAdmin }: { ticketId: string; isAdmin: boolean }) {
  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("service_id, service_snapshot").eq("id", ticketId).maybeSingle();
  if (!t?.service_id) return null;
  const { data: svc } = await supabase.from("services").select("is_diagnostic_fee, base_price").eq("id", t.service_id).maybeSingle();
  if (!svc?.is_diagnostic_fee) return null;
  const { data: credit } = await supabase.from("diagnosis_credits").select("amount, status").eq("ticket_id", ticketId).maybeSingle();
  const price = (t.service_snapshot as { base_price?: number } | null)?.base_price ?? svc.base_price;
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="m-0 text-[17px] font-extrabold">Diagnóstico</h2>
      <p className="m-0 text-[13px] text-muted">{DIAGNOSIS_CONDITION}</p>
      {credit ? (
        <p className="m-0 text-[14px] font-semibold">
          Pagado: {money(credit.amount)} · {STATUS[credit.status] ?? credit.status}
        </p>
      ) : (
        <>
          <p className="m-0 text-[14px] font-semibold">Valor del diagnóstico: {money(price)} · sin pago registrado.</p>
          {isAdmin ? (
            <form action={recordDiagnosisPaymentAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="ticketId" value={ticketId} />
              <label className="flex flex-col gap-1 text-[13px] font-bold">
                Medio de pago
                <select name="method" className="h-11 rounded-[12px] border border-line-strong bg-white px-3 text-[15px]">
                  <option value="cash">Efectivo</option>
                  <option value="bank_transfer">Transferencia</option>
                  <option value="other">Otro</option>
                </select>
              </label>
              <button type="submit" className="min-h-11 rounded-[12px] bg-ink px-4 text-[14px] font-extrabold text-white">
                Registrar pago del diagnóstico
              </button>
            </form>
          ) : null}
        </>
      )}
    </Card>
  );
}
