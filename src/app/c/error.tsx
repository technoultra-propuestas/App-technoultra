"use client";

import { useEffect } from "react";
import { haptic } from "@/lib/haptics";

/** Error dentro del panel: se mantiene la navegación, se explica con calma y se ofrece reintentar. Sin detalle técnico (solo un código para soporte). */
export default function SectionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("route.error", error.digest ?? "sin-digest");
    haptic("error");
  }, [error]);
  return (
    <section role="alert" className="mx-auto flex max-w-[480px] flex-col items-center gap-3 rounded-card border border-line bg-white p-8 text-center shadow-card">
      <h1 className="m-0 text-[24px] font-extrabold tracking-[-0.02em]">No pudimos cargar esta pantalla</h1>
      <p className="m-0 text-[15px] leading-normal text-muted">Ya registramos el problema. Puedes intentarlo de nuevo; tus datos están a salvo.</p>
      {error.digest ? <p className="m-0 text-[12px] font-semibold text-muted">Código de soporte: {error.digest}</p> : null}
      <button type="button" onClick={reset} className="press min-h-12 rounded-[14px] bg-brand px-6 text-[15px] font-extrabold text-ink">
        Reintentar
      </button>
    </section>
  );
}
