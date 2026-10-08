"use client";

import { useActionState, useState } from "react";
import { Alert, SubmitButton } from "@/components/ui/form";
import { Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { ACCESSORIES, DAMAGES } from "@/lib/domain/reception";
import { saveReceptionAction } from "../reception-actions";

export function ReceptionForm({
  ticketId,
  defaults,
  saved,
}: {
  ticketId: string;
  defaults: { reason: string; accessories: string[]; damage: string[]; physicalCondition: string; observations: string };
  saved: boolean;
}) {
  const [state, action] = useActionState(saveReceptionAction, initialState);
  // Con la recepción ya guardada el botón solo aparece cuando hay cambios pendientes (no se «actualiza» por inercia).
  const [dirty, setDirty] = useState(false);
  const group = (name: string, label: string, options: string[], selected: string[]) => (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-[15px] font-bold">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-[14px] font-semibold">
            <input type="checkbox" name={name} value={o} defaultChecked={selected.includes(o)} className="h-5 w-5 accent-[#FF8A00]" />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <form action={action} onChange={() => setDirty(true)} onSubmit={() => setDirty(false)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="ticketId" value={ticketId} />
      <Textarea label="Motivo de ingreso" name="reason" defaultValue={defaults.reason} required error={state.fieldErrors?.reason} />
      {group("accessories", "Accesorios recibidos", ACCESSORIES, defaults.accessories)}
      {group("damage", "Daños visibles", DAMAGES, defaults.damage)}
      <Textarea label="Estado físico" name="physicalCondition" defaultValue={defaults.physicalCondition} />
      <Textarea label="Observaciones" name="observations" defaultValue={defaults.observations} />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      {!saved || dirty ? <SubmitButton pendingText="Guardando…">{saved ? "Actualizar recepción" : "Guardar recepción"}</SubmitButton> : <p className="m-0 text-[14px] font-extrabold text-ok">✓ Recepción guardada</p>}
    </form>
  );
}
