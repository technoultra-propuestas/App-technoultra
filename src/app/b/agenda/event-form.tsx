"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { Select } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { createEventAction } from "./actions";

export function EventForm({ staff }: { staff: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createEventAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <Field label="Título" name="title" required error={state.fieldErrors?.title} />
      <Select label="Tipo" name="type" defaultValue="visit">
        <option value="visit">Visita</option>
        <option value="reception">Recepción</option>
        <option value="diagnosis">Diagnóstico</option>
        <option value="delivery">Entrega</option>
        <option value="maintenance">Mantenimiento</option>
        <option value="warranty">Garantía</option>
        <option value="crm">CRM</option>
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha" name="day" type="date" required error={state.fieldErrors?.day} />
        <Field label="Hora" name="time" type="time" defaultValue="09:00" required error={state.fieldErrors?.time} />
      </div>
      <Field label="Duración (min)" name="duration" inputMode="numeric" defaultValue="60" />
      <Select label="Responsable" name="assignedTo" defaultValue="">
        <option value="">Sin asignar</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Creando…">Crear evento</SubmitButton>
    </form>
  );
}
