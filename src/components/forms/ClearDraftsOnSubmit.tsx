"use client";

import { useEffect, useRef } from "react";
import { clearAllDrafts } from "@/lib/drafts";

/** Dentro del formulario de «Cerrar sesión»: al enviarlo borra los borradores guardados en este navegador (equipos compartidos). */
export function ClearDraftsOnSubmit() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onSubmit = () => {
      try {
        clearAllDrafts(localStorage);
      } catch {
        /* sin almacenamiento */
      }
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);
  return <span ref={ref} hidden aria-hidden="true" />;
}
