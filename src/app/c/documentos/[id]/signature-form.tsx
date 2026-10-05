"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Alert, SubmitButton } from "@/components/ui/form";
import { initialState } from "@/lib/auth/schemas";
import { signDocumentAction } from "../actions";

/** Firma con el dedo, mouse o lápiz (eventos de puntero). El trazo se envía como PNG y se vuelve a validar en el servidor. */
export function SignatureForm({ documentId, code }: { documentId: string; code: string }) {
  const [state, action] = useActionState(signDocumentAction, initialState);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<SignaturePad | null>(null);
  const [data, setData] = useState("");
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const resize = () => {
      const keep = pad.current && !pad.current.isEmpty() ? pad.current.toData() : null;
      c.width = c.offsetWidth * ratio;
      c.height = c.offsetHeight * ratio;
      c.getContext("2d")?.scale(ratio, ratio);
      pad.current?.clear();
      if (keep) pad.current?.fromData(keep);
    };
    pad.current = new SignaturePad(c, { penColor: "#121212", minWidth: 0.8, maxWidth: 2.4 });
    resize();
    const sync = () => {
      setEmpty(pad.current?.isEmpty() ?? true);
      setData(pad.current && !pad.current.isEmpty() ? pad.current.toDataURL("image/png") : "");
    };
    pad.current.addEventListener("endStroke", sync);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.current?.off();
    };
  }, []);

  if (state.ok) return <Alert tone="ok">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="signature" value={data} />
      <div className="text-[15px] font-bold">Firma aquí</div>
      <canvas
        ref={canvas}
        aria-label="Zona de firma. Dibuja tu firma con el dedo, el mouse o un lápiz."
        className="h-44 w-full touch-none rounded-[14px] border-[1.5px] border-line-strong bg-white"
      />
      <button
        type="button"
        onClick={() => {
          pad.current?.clear();
          setData("");
          setEmpty(true);
        }}
        className="min-h-11 w-fit rounded-[12px] border border-line-strong bg-white px-4 text-[14px] font-extrabold"
      >
        Borrar firma
      </button>
      <label className="flex items-start gap-3 text-[14px] font-semibold leading-snug">
        <input type="checkbox" name="accept" required className="mt-0.5 h-6 w-6 flex-none accent-[#FF8A00]" />
        Leí el documento {code} y lo acepto. Entiendo que mi firma queda asociada a esta versión exacta del documento.
      </label>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div className={empty ? "pointer-events-none opacity-50" : ""}>
        <SubmitButton pendingText="Firmando…">Firmar documento</SubmitButton>
      </div>
    </form>
  );
}
