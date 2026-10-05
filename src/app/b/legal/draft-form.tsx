"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { Select, Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { LEGAL_SLUGS } from "@/lib/domain/legal";
import { createLegalDraftAction } from "./actions";

export function LegalDraftForm() {
  const [state, action] = useActionState(createLegalDraftAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Select label="Documento" name="slug" defaultValue="terms">
        {LEGAL_SLUGS.map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.label}
          </option>
        ))}
      </Select>
      <Field label="Título" name="title" required error={state.fieldErrors?.title} />
      <Textarea label="Contenido (texto plano)" name="content" rows={12} required error={state.fieldErrors?.content} />
      <label className="flex items-center gap-3 text-[14px] font-semibold">
        <input type="checkbox" name="requiresAcceptance" defaultChecked className="h-5 w-5 accent-[#FF8A00]" />
        Exigir aceptación de los usuarios
      </label>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Guardando…">Crear borrador</SubmitButton>
    </form>
  );
}
