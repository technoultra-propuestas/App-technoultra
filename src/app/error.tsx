"use client";

import { useEffect } from "react";

/** Error inesperado: mensaje amable y reintento. Nunca se muestra el detalle técnico (solo un código opaco para soporte). */
export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("route.error", error.digest ?? "sin-digest");
  }, [error]);
  return (
    <main className="min-h-screen-dvh pt-safe pb-safe flex flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">Algo salió mal</h1>
      <p className="m-0 max-w-[360px] text-base leading-normal text-muted">Ya registramos el problema. Puedes intentarlo de nuevo; tus datos están a salvo.</p>
      {error.digest ? <p className="m-0 text-[12px] text-muted">Código de soporte: {error.digest}</p> : null}
      <button type="button" onClick={reset} className="min-h-[52px] rounded-2xl bg-brand px-7 text-[16px] font-extrabold text-ink">
        Reintentar
      </button>
    </main>
  );
}
