"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { Select } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { updatePreferencesAction, updateProfileAction } from "./actions";

export function ProfileForm({
  values,
}: {
  values: {
    full_name: string;
    phone: string | null;
    document_type: string | null;
    document_number: string | null;
    company_name: string | null;
    email: string;
  };
}) {
  const [state, action] = useActionState(updateProfileAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <Field
        label="Nombre completo"
        name="fullName"
        defaultValue={values.full_name}
        required
        autoComplete="name"
        error={state.fieldErrors?.fullName}
      />
      <Field
        label="Correo"
        name="email"
        defaultValue={values.email}
        disabled
        hint="Para cambiar el correo, escríbenos."
      />
      <Field
        label="Celular"
        name="phone"
        type="tel"
        inputMode="tel"
        defaultValue={values.phone ?? ""}
        required
        error={state.fieldErrors?.phone}
      />
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <Select label="Documento" name="documentType" defaultValue={values.document_type ?? ""}>
          <option value="">—</option>
          <option value="CC">CC</option>
          <option value="CE">CE</option>
          <option value="NIT">NIT</option>
          <option value="PP">PP</option>
          <option value="TI">TI</option>
        </Select>
        <Field
          label="Número"
          name="documentNumber"
          defaultValue={values.document_number ?? ""}
          error={state.fieldErrors?.documentNumber}
        />
      </div>
      <Field label="Empresa (opcional)" name="companyName" defaultValue={values.company_name ?? ""} />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
    </form>
  );
}

export function PreferencesForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [state, action] = useActionState(updatePreferencesAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex items-center gap-3 text-[15px] font-semibold">
        <input
          type="checkbox"
          name="email"
          defaultChecked={emailEnabled}
          className="h-6 w-6 accent-[#FF8A00]"
        />
        Recibir avisos importantes por correo
      </label>
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingText="Guardando…">Guardar preferencias</SubmitButton>
    </form>
  );
}
