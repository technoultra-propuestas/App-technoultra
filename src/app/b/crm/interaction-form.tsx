"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { Select, Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { CRM_LABEL } from "@/lib/domain/crm";
import { logInteractionAction } from "./actions";

export function InteractionForm({ taskId }: { taskId: string }) {
  const [state, action] = useActionState(logInteractionAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="taskId" value={taskId} />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Canal" name="channel" defaultValue="whatsapp">
          <option value="whatsapp">WhatsApp</option>
          <option value="call">Llamada</option>
          <option value="email">Correo</option>
          <option value="visit">Visita</option>
          <option value="app">App</option>
        </Select>
        <Select label="Resultado" name="result" defaultValue="contacted">
          {Object.entries(CRM_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </div>
      <Textarea label="Observaciones" name="note" rows={2} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Próxima acción" name="nextAction" />
        <Field label="Fecha" name="nextActionAt" type="date" />
      </div>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Guardando…">Registrar contacto</SubmitButton>
    </form>
  );
}
