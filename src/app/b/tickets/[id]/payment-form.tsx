"use client";

import { useActionState, useState } from "react";
import { MANUAL_METHODS, manualPaymentProblem, type ManualMethod } from "@/lib/payments/staff";
import { registerPaymentAction, type PaymentResult } from "../payment-actions";
import { EvidenceUploader } from "./evidence-uploader";

/** Registro manual de un cobro. Solo se renderiza cuando el servidor confirmó que NO hay cobro confirmado ni en curso. */
export function ManualPaymentForm({ ticketId, kind, refId, amountText }: { ticketId: string; kind: "diagnosis" | "service" | "quote"; refId: string; amountText: string }) {
  const [state, action, pending] = useActionState<PaymentResult | null, FormData>(registerPaymentAction, null);
  const [method, setMethod] = useState<ManualMethod>("cash");
  const [voucher, setVoucher] = useState<string | null>(null);
  const hint = MANUAL_METHODS.find((m) => m.value === method)?.hint;
  const problem = manualPaymentProblem(method, voucher);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-[14px] border border-line p-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="ref" value={refId} />
      <input type="hidden" name="voucherId" value={voucher ?? ""} />
      <label className="flex flex-col gap-1 text-[13px] font-bold">
        Método de pago
        <select name="method" value={method} onChange={(e) => setMethod(e.target.value as ManualMethod)} className="h-11 w-full min-w-0 rounded-[12px] border border-line-strong bg-white px-3 text-[15px]">
          {MANUAL_METHODS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <span className="text-[12px] font-semibold text-muted">{hint}</span>
      </label>
      {method === "datafono" || method === "bank_transfer" ? (
        <EvidenceUploader ticketId={ticketId} stage="payment" slot="voucher" label={method === "datafono" ? "Foto del comprobante (obligatoria)" : "Soporte de la transferencia (opcional)"} done={Boolean(voucher)} onRegistered={setVoucher} />
      ) : null}
      {method !== "cash" ? (
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Referencia
          <input name="reference" maxLength={80} placeholder="N.º de aprobación, recibo o transferencia" className="h-11 w-full min-w-0 rounded-[12px] border border-line-strong bg-white px-3 text-[15px]" />
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-[13px] font-bold">
        Observación (opcional)
        <input name="note" maxLength={300} className="h-11 w-full min-w-0 rounded-[12px] border border-line-strong bg-white px-3 text-[15px]" />
      </label>
      {problem ? <p className="m-0 text-[13px] font-semibold text-muted">{problem}</p> : null}
      {state ? <p role={state.ok ? "status" : "alert"} className={`m-0 text-[13.5px] font-bold ${state.ok ? "text-ok" : "text-[#9A2B1E]"}`}>{state.message}</p> : null}
      <button type="submit" disabled={pending || Boolean(problem)} className="min-h-12 rounded-[12px] bg-ink px-4 text-[15px] font-extrabold text-white disabled:opacity-50">
        {pending ? "Registrando…" : `Registrar pago manual · ${amountText}`}
      </button>
    </form>
  );
}
