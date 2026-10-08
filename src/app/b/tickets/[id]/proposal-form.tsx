"use client";

import { useActionState, useMemo, useState } from "react";
import { Alert, SubmitButton } from "@/components/ui/form";
import { initialState } from "@/lib/auth/schemas";
import { PRIORITY_LABEL, type Priority } from "@/lib/quotes/proposal";
import { applyProposalAction } from "../proposal-actions";

type Line = { key: string; name: string; priority: Priority; price: number | null; priceText: string | null; review: boolean; reviewWhy: string | null; reason: string };
const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

/** Lista de servicios propuestos, marcados de entrada. Solo viajan los ids elegidos: el servidor recalcula el precio desde el catálogo. */
export function ProposalForm({ ticketId, lines }: { ticketId: string; lines: Line[] }) {
  const [state, action] = useActionState(applyProposalAction, initialState);
  // Marcados de entrada: los que tienen precio de catálogo. Los «a cotizar» sin precio no se pueden marcar (se agregan a mano).
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(lines.map((l) => [l.key, l.price !== null])));
  const subtotal = useMemo(() => lines.reduce((s, l) => s + (on[l.key] && l.price !== null ? l.price : 0), 0), [lines, on]);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {lines.map((l) => (
          <li key={l.key}>
            <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-[14px] border border-line p-3">
              <input type="checkbox" name="keys" value={l.key} checked={Boolean(on[l.key])} disabled={l.price === null} onChange={(e) => setOn((o) => ({ ...o, [l.key]: e.target.checked }))} className="mt-0.5 h-5 w-5 flex-none accent-[#FF8A00]" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-[15px] font-extrabold">{l.name}</span>
                  <span className="text-[15px] font-extrabold">{l.priceText ?? "Requiere revisión"}</span>
                </span>
                <span className="text-[12.5px] text-muted">
                  {PRIORITY_LABEL[l.priority]} · {l.reason}
                  {l.reviewWhy ? ` ${l.reviewWhy}` : ""}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between text-[14px] font-bold">
        <span>Mano de obra propuesta</span>
        <span className="text-[17px] font-extrabold">{cop(subtotal)}</span>
      </div>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Preparando cotización…">Usar propuesta</SubmitButton>
    </form>
  );
}
