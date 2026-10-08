"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormDraft } from "@/components/forms/FormDraft";
import { Alert, SubmitButton } from "@/components/ui/form";
import { Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { decideQuoteAction } from "../actions";

/**
 * Barra de decisión de la cotización: UNA acción principal (aprobar) y dos alternativas (preguntar, rechazar). Rechazar pide un motivo
 * corto; preguntar crea un mensaje asociado a la cotización. Nada se envía sin confirmación explícita.
 */
export function QuoteDecision({ ticketId, quoteId, total }: { ticketId: string; quoteId: string; total: string }) {
  const [state, action] = useActionState(decideQuoteAction, initialState);
  const [mode, setMode] = useState<"none" | "reject" | "question">("none");
  if (state.ok)
    return (
      <div className="flex flex-col gap-3">
        <Alert tone="ok">{state.message}</Alert>
        <Link href={`/c/tickets/${ticketId}`} className="press flex min-h-[58px] w-full items-center justify-center rounded-2xl bg-brand px-5 text-[17px] font-extrabold text-ink no-underline">
          Continuar
        </Link>
      </div>
    );
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
        <button type="button" aria-expanded={mode === "question"} onClick={() => setMode(mode === "question" ? "none" : "question")} className="min-h-12 rounded-2xl border-[1.5px] border-line-strong bg-white text-[15px] font-extrabold">
          Tengo una pregunta
        </button>
        <button type="button" aria-expanded={mode === "reject"} onClick={() => setMode(mode === "reject" ? "none" : "reject")} className="min-h-12 rounded-2xl border-[1.5px] border-line-strong bg-white text-[15px] font-extrabold text-[#9A2B1E]">
          Rechazar
        </button>
      </div>
      {mode !== "none" ? (
        <form action={action} className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-3">
          <FormDraft id={`cotizacion-${quoteId}-${mode}`} />
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="quoteId" value={quoteId} />
          <input type="hidden" name="decision" value={mode} />
          <Textarea label={mode === "reject" ? "Cuéntanos brevemente por qué" : "Escribe tu pregunta"} name="message" required />
          {mode === "reject" ? <p className="m-0 text-[13px] text-muted">Si la rechazas, el servicio se cancela y tu equipo queda disponible para devolución.</p> : <p className="m-0 text-[13px] text-muted">Tu pregunta queda asociada a esta cotización; te respondemos aquí mismo.</p>}
          <SubmitButton variant={mode === "reject" ? "dark" : "primary"} pendingText="Enviando…">
            {mode === "reject" ? "Confirmar rechazo" : "Enviar pregunta"}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
