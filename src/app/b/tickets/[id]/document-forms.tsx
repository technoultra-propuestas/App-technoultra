"use client";

import { useActionState } from "react";
import { Alert, SubmitButton } from "@/components/ui/form";
import { initialState } from "@/lib/auth/schemas";
import { generateDocumentAction } from "../doc-actions";

export function GenerateDocForm({ ticketId, kind, label }: { ticketId: string; kind: string; label: string }) {
  const [state, action] = useActionState(generateDocumentAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="kind" value={kind} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton variant="dark" pendingText="Generando…">
        {label}
      </SubmitButton>
    </form>
  );
}
