"use client";

import { useActionState } from "react";
import { initialState } from "@/lib/auth/schemas";
import { saveTaxAction } from "./actions";

/** Configuración de IVA con respuesta junto al botón («✓ Guardado» o el error). */
export function TaxForm({ responsible, rate }: { responsible: boolean; rate: number }) {
  const [state, action, pending] = useActionState(saveTaxAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-3 text-[15px] font-semibold">
          <input type="checkbox" name="responsible" defaultChecked={responsible} className="h-6 w-6 accent-[#FF8A00]" />
          Responsable de IVA
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Tarifa IVA (%)
          <input name="rate" defaultValue={rate} inputMode="decimal" className="h-11 w-28 rounded-[12px] border border-line-strong bg-white px-3 text-[15px]" />
        </label>
        <button type="submit" disabled={pending} className="min-h-11 rounded-[12px] bg-ink px-5 text-[14px] font-extrabold text-white disabled:opacity-60">
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
      {state.ok && state.message ? <p role="status" className="m-0 text-[13.5px] font-extrabold text-ok">✓ {state.message}</p> : null}
      {!state.ok && state.error ? <p role="alert" className="m-0 text-[13.5px] font-bold text-danger">{state.error}</p> : null}
    </form>
  );
}
