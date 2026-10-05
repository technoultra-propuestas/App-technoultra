"use client";

import { useActionState } from "react";
import { Alert, SubmitButton } from "@/components/ui/form";
import { Select, Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { addNoteAction, assignAction, transitionAction } from "../actions";

export function TransitionForm({ ticketId, options }: { ticketId: string; options: { to: string; label: string; requiresReason: boolean }[] }) {
  const [state, action] = useActionState(transitionAction, initialState);
  if (options.length === 0) return <p className="m-0 text-[14px] text-muted">No hay cambios de estado disponibles para ti en este momento.</p>;
  return (
    <div className="flex flex-col gap-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      {options.map((o) => (
        <form key={o.to} action={action} className="flex flex-col gap-2 rounded-[14px] border border-line p-3">
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="to" value={o.to} />
          {o.requiresReason ? <Textarea label="Motivo" name="reason" required aria-label={`Motivo para ${o.label}`} /> : null}
          <SubmitButton variant={o.to === "cancelled" ? "dark" : "primary"} pendingText="Aplicando…">
            Pasar a «{o.label}»
          </SubmitButton>
        </form>
      ))}
    </div>
  );
}

export function AssignForm({ ticketId, staff, current }: { ticketId: string; staff: { id: string; name: string }[]; current: string | null }) {
  const [state, action] = useActionState(assignAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <Select label="Asignar a" name="staffId" defaultValue={current ?? ""}>
        <option value="" disabled>
          Elige una persona
        </option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Asignando…">Asignar</SubmitButton>
    </form>
  );
}

export function NoteForm({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState(addNoteAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <Textarea label="Nueva nota" name="body" required error={state.fieldErrors?.body} />
      <Select label="Visible para" name="visibility" defaultValue="internal">
        <option value="internal">Solo el equipo</option>
        <option value="customer">El cliente también</option>
      </Select>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Guardando…">Guardar nota</SubmitButton>
    </form>
  );
}
