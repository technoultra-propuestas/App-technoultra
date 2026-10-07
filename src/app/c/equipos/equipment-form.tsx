"use client";

import { useActionState } from "react";
import { FormDraft } from "@/components/forms/FormDraft";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { Select, Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { createEquipmentAction, updateEquipmentAction } from "./actions";

type Values = {
  id?: string;
  type?: string;
  brand?: string;
  model?: string;
  serial?: string | null;
  ram?: string | null;
  storage?: string | null;
  year?: number | null;
  notes?: string | null;
};

export function EquipmentForm({ values, returnTo }: { values?: Values; returnTo?: string | null }) {
  const editing = Boolean(values?.id);
  const [state, action] = useActionState(
    editing ? updateEquipmentAction : createEquipmentAction,
    initialState,
  );
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      {editing ? null : <FormDraft id="equipo-nuevo" />}
      {editing ? <input type="hidden" name="id" value={values?.id} /> : null}
      {/* Destino de retorno (ruta interna ya validada en el servidor; la acción la valida de nuevo). */}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <Select
        label="Tipo de equipo"
        name="type"
        defaultValue={values?.type ?? "laptop"}
        error={state.fieldErrors?.type}
      >
        <option value="laptop">Portátil</option>
        <option value="desktop">Escritorio</option>
        <option value="all_in_one">Todo en uno</option>
        <option value="printer">Impresora</option>
        <option value="network">Red / router</option>
        <option value="other">Otro</option>
      </Select>
      <Field
        label="Marca"
        name="brand"
        defaultValue={values?.brand}
        required
        error={state.fieldErrors?.brand}
      />
      <Field
        label="Modelo"
        name="model"
        defaultValue={values?.model}
        required
        error={state.fieldErrors?.model}
      />
      <Field
        label="Serial (opcional)"
        name="serial"
        defaultValue={values?.serial ?? ""}
        hint="Lo encuentras en una etiqueta del equipo."
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Memoria RAM" name="ram" defaultValue={values?.ram ?? ""} placeholder="8 GB" />
        <Field
          label="Almacenamiento"
          name="storage"
          defaultValue={values?.storage ?? ""}
          placeholder="SSD 256 GB"
        />
      </div>
      <Field
        label="Año (opcional)"
        name="year"
        inputMode="numeric"
        defaultValue={values?.year ?? ""}
        error={state.fieldErrors?.year}
      />
      <Textarea label="Observaciones (opcional)" name="notes" defaultValue={values?.notes ?? ""} />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Guardando…">{editing ? "Guardar cambios" : "Guardar equipo"}</SubmitButton>
    </form>
  );
}
