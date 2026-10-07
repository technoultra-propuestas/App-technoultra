"use client";

import { useActionState, useState } from "react";
import { FormDraft } from "@/components/forms/FormDraft";
import { Alert, SubmitButton } from "@/components/ui/form";
import { Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { decideQuoteAction } from "../actions";

/** Tres decisiones; cada una pide confirmación explícita (sin acciones destructivas de un solo toque). */
export function QuoteDecision({ ticketId, quoteId, total }: { ticketId: string; quoteId: string; total: string }) {
  const [state, action] = useActionState(decideQuoteAction, initialState);
  const [mode, setMode] = useState<"none" | "reject" | "question">("none");
  if (state.ok) return <Alert tone="ok">{state.message}</Alert>;
  return (
    <div className="flex flex-col gap-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="ticketId" value={ticketId} />
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="decision" value="approve" />
        <SubmitButton pendingText="Registrando…">Aprobar cotización · {total}</SubmitButton>
      </form>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setMode(mode === "question" ? "none" : "question")} className="min-h-12 rounded-2xl border-[1.5px] border-line-strong bg-white text-[15px] font-extrabold">
          Preguntar
        </button>
        <button type="button" onClick={() => setMode(mode === "reject" ? "none" : "reject")} className="min-h-12 rounded-2xl border-[1.5px] border-line-strong bg-white text-[15px] font-extrabold text-[#9A2B1E]">
          Rechazar
        </button>
      </div>
      {mode !== "none" ? (
        <form action={action} className="flex flex-col gap-2 rounded-[14px] border border-line p-3">
          <FormDraft id={`cotizacion-${quoteId}-${mode}`} />
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="quoteId" value={quoteId} />
          <input type="hidden" name="decision" value={mode} />
          <Textarea label={mode === "reject" ? "¿Por qué la rechazas? (opcional)" : "Tu pregunta"} name="message" required={mode === "question"} />
          {mode === "reject" ? <p className="m-0 text-[13px] text-muted">Si la rechazas, el servicio se cancela y tu equipo queda disponible para devolución.</p> : null}
          <SubmitButton variant={mode === "reject" ? "dark" : "primary"} pendingText="Enviando…">
            {mode === "reject" ? "Confirmar rechazo" : "Enviar pregunta"}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
