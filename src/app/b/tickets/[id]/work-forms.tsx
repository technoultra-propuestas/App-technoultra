"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { DIAGNOSTIC_COMPONENTS } from "@/lib/domain/reception";
import { completeChecklistAction, saveDeliveryAction, saveDiagnosisAction } from "../work-actions";

const Result = ({ state }: { state: { ok: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> } }) => (
  <>
    {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
    {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
  </>
);

export function DiagnosisForm({
  ticketId,
  defaults,
}: {
  ticketId: string;
  defaults: { summary: string; tests: string; recommendations: string; parts: string; visible: boolean; items: Record<string, string> };
}) {
  const [state, action] = useActionState(saveDiagnosisAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="ticketId" value={ticketId} />
      <Textarea label="Diagnóstico técnico" name="summary" defaultValue={defaults.summary} required error={state.fieldErrors?.summary} />
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-[15px] font-bold">Componentes evaluados</legend>
        {DIAGNOSTIC_COMPONENTS.map((c, i) => (
          <label key={c} className="flex items-center justify-between gap-3 text-[14px] font-semibold">
            {c}
            <select name={`comp_${i}`} defaultValue={defaults.items[c] ?? ""} className="h-11 rounded-[12px] border-[1.5px] border-line-strong bg-white px-3 text-[14px]">
              <option value="">Sin evaluar</option>
              <option value="ok">OK</option>
              <option value="review">Revisar</option>
              <option value="fail">Falla</option>
            </select>
          </label>
        ))}
      </fieldset>
      <Textarea label="Pruebas realizadas" name="testsPerformed" defaultValue={defaults.tests} />
      <Textarea label="Recomendaciones" name="recommendations" defaultValue={defaults.recommendations} />
      <Field label="Repuestos sugeridos" name="suggestedParts" defaultValue={defaults.parts} />
      <label className="flex items-center gap-3 text-[14px] font-semibold">
        <input type="checkbox" name="visible" defaultChecked={defaults.visible} className="h-5 w-5 accent-[#FF8A00]" />
        Mostrar este diagnóstico al cliente
      </label>
      <Result state={state} />
      <SubmitButton pendingText="Guardando…">Guardar diagnóstico</SubmitButton>
    </form>
  );
}

export function CompleteChecklistForm({ ticketId, runId }: { ticketId: string; runId: string }) {
  const [state, action] = useActionState(completeChecklistAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="runId" value={runId} />
      <Result state={state} />
      <SubmitButton pendingText="Verificando…">Completar checklist</SubmitButton>
    </form>
  );
}

export function DeliveryForm({ ticketId, defaultMonths }: { ticketId: string; defaultMonths: number }) {
  const [state, action] = useActionState(saveDeliveryAction, initialState);
  const d = new Date();
  d.setMonth(d.getMonth() + defaultMonths);
  const next = d.toISOString().slice(0, 10);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="ticketId" value={ticketId} />
      <Field label="Quién recibe el equipo" name="receivedBy" required error={state.fieldErrors?.receivedBy} />
      <Field label="Próximo mantenimiento recomendado" name="nextMaintenance" type="date" defaultValue={next} hint={`Por defecto ${defaultMonths} meses (configurable en administración).`} />
      <Textarea label="Notas de entrega" name="notes" />
      <Result state={state} />
      <SubmitButton pendingText="Registrando…">Registrar entrega</SubmitButton>
    </form>
  );
}
