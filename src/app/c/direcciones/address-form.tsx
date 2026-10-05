"use client";

import { useActionState, useState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { Select } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { addAddressAction } from "./actions";

export function AddressForm({ cities }: { cities: { dane_code: string; city_name: string }[] }) {
  const [state, action] = useActionState(addAddressAction, initialState);
  const [dane, setDane] = useState(cities[0]?.dane_code ?? "other");
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre (Casa, Oficina…)" name="label" defaultValue="Casa" />
      <Select label="Ciudad" name="dane" value={dane} onChange={(e) => setDane(e.target.value)}>
        {cities.map((c) => (
          <option key={c.dane_code} value={c.dane_code}>
            {c.city_name}
          </option>
        ))}
        <option value="other">Otra ciudad (solo soporte remoto)</option>
      </Select>
      {dane === "other" ? (
        <>
          <Field label="Ciudad" name="otherCity" required />
          <Field label="Departamento" name="otherDept" required />
        </>
      ) : null}
      <Field
        label="Dirección"
        name="line1"
        autoComplete="street-address"
        required
        error={state.fieldErrors?.line1}
      />
      <Field label="Barrio (opcional)" name="neighborhood" />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Guardando…">Guardar dirección</SubmitButton>
    </form>
  );
}
