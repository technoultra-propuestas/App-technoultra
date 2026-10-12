"use client";

import { SignaturePadForm } from "@/components/forms/SignaturePadForm";
import { signDocumentAction } from "../actions";

/** Firma del cliente desde su propia sesión autenticada. */
export function SignatureForm({ documentId, code }: { documentId: string; code: string }) {
  return (
    <SignaturePadForm
      action={signDocumentAction}
      fields={{ documentId }}
      title="Dibuja tu firma en el recuadro"
      consent={`Leí el documento ${code} y lo acepto. Entiendo que mi firma queda asociada a esta versión exacta del documento.`}
      submitLabel="Firmar y aceptar"
    />
  );
}
