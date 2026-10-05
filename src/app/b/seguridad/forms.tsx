"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { initialState } from "@/lib/auth/schemas";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field label="Contraseña actual" name="current" type="password" autoComplete="current-password" required error={state.fieldErrors?.current} />
      <Field label="Contraseña nueva" name="password" type="password" autoComplete="new-password" required hint="Mínimo 10 caracteres, con mayúscula, minúscula y número." error={state.fieldErrors?.password} />
      <Field label="Repite la contraseña nueva" name="confirm" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirm} />
      <Field label="Código de tu autenticador" name="code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="······" required error={state.fieldErrors?.code} />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Guardando…">Cambiar contraseña</SubmitButton>
    </form>
  );
}
