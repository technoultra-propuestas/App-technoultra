"use client";

import { useActionState } from "react";
import { initialState } from "@/lib/auth/schemas";
import { updateFeesAction } from "./actions";

/** Tarifas de un municipio: guarda, muestra «Tarifas guardadas» o el motivo del error (antes no daba ninguna respuesta visible). */
export function FeesForm({ id, pickupFee, homeFee }: { id: string; pickupFee: number; homeFee: number }) {
  const [state, action, pending] = useActionState(updateFeesAction, initialState);
  const input = "h-11 w-28 rounded-[12px] border-[1.5px] border-line-strong bg-white px-3 text-[15px] font-semibold";
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={id} />
        <label className="flex flex-col gap-1 text-[12px] font-bold">
          Recogida
          <input name="pickupFee" defaultValue={pickupFee} inputMode="numeric" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold">
          Domicilio
          <input name="homeFee" defaultValue={homeFee} inputMode="numeric" className={input} />
        </label>
        <button type="submit" disabled={pending} className="min-h-11 rounded-[12px] border border-line-strong bg-white px-4 text-[14px] font-extrabold disabled:opacity-60">
          {pending ? "Guardando…" : "Guardar tarifas"}
        </button>
      </div>
      {state.ok && state.message ? <p role="status" className="m-0 text-[13px] font-extrabold text-ok">✓ {state.message}</p> : null}
      {!state.ok && state.error ? <p role="alert" className="m-0 text-[13px] font-bold text-danger">{state.error}</p> : null}
    </form>
  );
}
