"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { fillLegalPlaceholdersAction, updateLegalDraftAction } from "./actions";

/** Un solo formulario completa los campos pendientes de todos los borradores. */
export function FillPlaceholdersForm({ pending }: { pending: string[] }) {
  const [state, action] = useActionState(fillLegalPlaceholdersAction, initialState);
  const has = (m: string) => pending.includes(m);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      {has("[PENDIENTE: CC/NIT]") ? <Field label="Cédula o NIT del responsable" name="nit" inputMode="text" placeholder="Ej.: 1.234.567.890" error={state.fieldErrors?.nit} /> : null}
      {has("[PENDIENTE: ciudad]") ? <Field label="Ciudad del domicilio" name="city" placeholder="Ej.: Cali" error={state.fieldErrors?.city} /> : null}
      {has("[PENDIENTE: correo jurídico]") ? <Field label="Correo para asuntos legales y de privacidad" name="email" type="email" inputMode="email" error={state.fieldErrors?.email} /> : null}
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Aplicando…">Completar en los borradores</SubmitButton>
    </form>
  );
}

export function EditDraftForm({ id, title, content }: { id: string; title: string; content: string }) {
  const [state, action] = useActionState(updateLegalDraftAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={id} />
      <Field label="Título" name="title" defaultValue={title} required error={state.fieldErrors?.title} />
      <Textarea label="Contenido (## título de sección, - viñeta, párrafos separados por una línea en blanco)" name="content" rows={18} defaultValue={content} required error={state.fieldErrors?.content} />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Guardando…">Guardar cambios</SubmitButton>
    </form>
  );
}
