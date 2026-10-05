"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { initialState } from "@/lib/auth/schemas";
import { addAreaAction } from "./actions";

export function AreaForm() {
  const [state, action] = useActionState(addAreaAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field label="Ciudad" name="city" required error={state.fieldErrors?.city} />
      <Field label="Departamento" name="department" defaultValue="Valle del Cauca" required error={state.fieldErrors?.department} />
      <Field label="Código DANE (5 dígitos)" name="dane" inputMode="numeric" maxLength={5} required error={state.fieldErrors?.dane} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tarifa recogida" name="pickupFee" inputMode="numeric" defaultValue="0" />
        <Field label="Tarifa domicilio" name="homeFee" inputMode="numeric" defaultValue="0" />
      </div>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Guardando…">Agregar</SubmitButton>
    </form>
  );
}
