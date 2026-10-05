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
      {/* El personal que se crea aquí es siempre TÉCNICO: el SUPERADMIN es único y no se asigna desde la aplicación. */}
      <input type="hidden" name="role" value="technician" />
      <p className="m-0 text-[13px] font-semibold text-muted">Se crea como técnico. Recibe un correo para crear su contraseña y configurar la verificación en dos pasos.</p>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Enviando…">Enviar invitación</SubmitButton>
    </form>
  );
}
