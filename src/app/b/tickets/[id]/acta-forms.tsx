"use client";

import { useActionState } from "react";
import { SignaturePadForm } from "@/components/forms/SignaturePadForm";
import { Alert, SubmitButton } from "@/components/ui/form";
import { initialState } from "@/lib/auth/schemas";
import { authorizeReceptionExceptionAction, captureClientSignatureAction } from "../signature-actions";

/** El cliente firma SU acta en este dispositivo (el personal solo presta la pantalla). */
export function AssistedSignature({ documentId, code, customer }: { documentId: string; code: string; customer: string }) {
  return (
    <SignaturePadForm
      action={captureClientSignatureAction}
      fields={{ documentId }}
      title={`Entrega el dispositivo a ${customer}: la firma debe dibujarla el cliente`}
      consent={`Confirmo que ${customer} leyó el acta ${code} y la firma personalmente en este dispositivo. No firmo en su nombre.`}
      submitLabel="Registrar firma del cliente"
    />
  );
}

/** Excepción auditada: solo el SUPERADMIN (el servidor lo vuelve a validar) puede continuar sin la firma del acta. */
export function ExceptionForm({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState(authorizeReceptionExceptionAction, initialState);
  if (state.ok) return <Alert tone="ok">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label className="flex flex-col gap-1 text-[13px] font-bold">
        Motivo de la excepción (queda registrado)
        <textarea name="reason" required minLength={5} maxLength={500} rows={2} className="rounded-[12px] border border-line-strong bg-white p-3 text-[14px] font-medium" />
      </label>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <SubmitButton variant="dark" pendingText="Autorizando…">
        Continuar sin firma (excepción)
      </SubmitButton>
    </form>
  );
}
