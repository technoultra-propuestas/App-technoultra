"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { initialState } from "@/lib/auth/schemas";
import { inviteStaffAction } from "./actions";

export function InviteStaffForm() {
  const [state, action] = useActionState(inviteStaffAction, initialState);
  return (
    <form
      action={action}
      className="flex h-fit flex-col gap-4 rounded-[20px] border border-line bg-white p-5"
      noValidate
    >
      <h2 className="m-0 text-[19px] font-extrabold">Agregar persona</h2>
      <Field label="Nombre completo" name="fullName" required error={state.fieldErrors?.fullName} />
      <Field
        label="Correo"
        name="email"
        type="email"
        inputMode="email"
        required
        error={state.fieldErrors?.email}
      />
      <Field
        label="Celular (opcional)"
        name="phone"
        type="tel"
        inputMode="tel"
        error={state.fieldErrors?.phone}
      />
      <Field label="Cargo (opcional)" name="title" />
      <label className="flex flex-col gap-2 text-[15px] font-bold">
        Rol
        <select
          name="role"
          defaultValue="technician"
          className="h-14 rounded-[14px] border-[1.5px] border-line-strong bg-white px-4 text-[17px] font-semibold"
        >
          <option value="technician">Técnico</option>
          <option value="admin">Administración</option>
        </select>
      </label>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Enviando…">Enviar invitación</SubmitButton>
    </form>
  );
}
