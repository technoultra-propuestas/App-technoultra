"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { Select, Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { PROJECT_STATUS } from "@/lib/domain/projects";
import { addProjectCommentAction, updateProjectAction } from "../actions";

export type ProjectValues = { id: string; title: string; scope: string | null; status: string; progress: number; owner_id: string | null; starts_on: string | null; due_on: string | null; client_notes: string | null };

export function ProjectForm({ values, staff }: { values: ProjectValues; staff: { id: string; name: string }[] }) {
  const [state, action] = useActionState(updateProjectAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={values.id} />
      <Field label="Título" name="title" defaultValue={values.title} required error={state.fieldErrors?.title} />
      <Textarea label="Alcance" name="scope" defaultValue={values.scope ?? ""} rows={5} />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Estado" name="status" defaultValue={values.status}>
          {Object.entries(PROJECT_STATUS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Field label="Avance (%)" name="progress" inputMode="numeric" defaultValue={values.progress} />
      </div>
      <Select label="Responsable" name="ownerId" defaultValue={values.owner_id ?? ""}>
        <option value="">Sin asignar</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inicio" name="startsOn" type="date" defaultValue={values.starts_on ?? ""} />
        <Field label="Entrega" name="dueOn" type="date" defaultValue={values.due_on ?? ""} />
      </div>
      <Textarea label="Nota visible para el cliente" name="clientNotes" defaultValue={values.client_notes ?? ""} rows={3} />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Guardando…">Guardar proyecto</SubmitButton>
    </form>
  );
}

export function ProjectCommentForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(addProjectCommentAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="projectId" value={projectId} />
      <Textarea label="Nuevo comentario" name="body" rows={3} required error={state.fieldErrors?.body} />
      <Select label="Visible para" name="visibility" defaultValue="client">
        <option value="client">El cliente</option>
        <option value="internal">Solo el equipo</option>
      </Select>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Guardando…">Comentar</SubmitButton>
    </form>
  );
}
