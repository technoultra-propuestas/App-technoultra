"use client";

import { useActionState } from "react";
import { initialState } from "@/lib/auth/schemas";
import { saveUrgencyAction } from "./actions";

const DAYS: [number, string][] = [[1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [7, "Dom"]];
const MODS: [string, string][] = [["store", "Taller"], ["pickup", "Recogida"], ["home", "Domicilio"], ["remote", "Remoto"]];
const field = "h-11 rounded-[12px] border border-line-strong bg-white px-3 text-[15px]";

export type UrgencyLevelView = {
  id: string;
  label: string;
  percent: number;
  fixed_amount: number;
  min_amount: number;
  start: string;
  end: string;
  days: number[];
  modalities: string[];
  is_active: boolean;
};

/** Un nivel de urgencia. Guarda y responde AL LADO del botón («✓ Nivel guardado» o el motivo del error): antes la respuesta salía arriba de la página. */
export function UrgencyForm({ level: l, services, selected }: { level: UrgencyLevelView; services: { id: string; name: string }[]; selected: string[] }) {
  const [state, action, pending] = useActionState(saveUrgencyAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={l.id} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Nombre
          <input name="label" defaultValue={l.label} className={`${field} w-56`} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Porcentaje (%)
          <input name="percent" defaultValue={l.percent} inputMode="decimal" className={`${field} w-24`} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Valor fijo ($)
          <input name="fixed" defaultValue={l.fixed_amount} inputMode="numeric" className={`${field} w-28`} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Mínimo ($)
          <input name="min" defaultValue={l.min_amount} inputMode="numeric" className={`${field} w-28`} />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Desde (hora)
          <input name="start" type="time" defaultValue={l.start} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Hasta (hora)
          <input name="end" type="time" defaultValue={l.end} className={field} />
        </label>
        <span className="text-[12px] text-muted">Sin horario = todo el día. Si «hasta» es menor que «desde» cruza la medianoche (ej. 18:00–07:00 para fuera de horario).</span>
      </div>
      <fieldset className="flex flex-wrap gap-3 border-0 p-0">
        <legend className="mb-1 text-[13px] font-bold">Días</legend>
        {DAYS.map(([d, name]) => (
          <label key={d} className="flex items-center gap-1.5 text-[14px] font-semibold">
            <input type="checkbox" name="days" value={d} defaultChecked={l.days.includes(d)} className="h-5 w-5 accent-[#FF8A00]" />
            {name}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap gap-3 border-0 p-0">
        <legend className="mb-1 text-[13px] font-bold">Modalidades</legend>
        {MODS.map(([m, name]) => (
          <label key={m} className="flex items-center gap-1.5 text-[14px] font-semibold">
            <input type="checkbox" name="modalities" value={m} defaultChecked={l.modalities.includes(m)} className="h-5 w-5 accent-[#FF8A00]" />
            {name}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-[13px] font-bold">
        Servicios a los que aplica (ninguno seleccionado = todos)
        <select name="services" multiple defaultValue={selected} size={5} className="rounded-[12px] border border-line-strong bg-white p-2 text-[14px] font-medium">
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-[15px] font-semibold">
          <input type="checkbox" name="active" defaultChecked={l.is_active} className="h-6 w-6 accent-[#FF8A00]" />
          Activo (disponible al cotizar)
        </label>
        <button type="submit" disabled={pending} className="min-h-11 rounded-[12px] bg-ink px-5 text-[14px] font-extrabold text-white disabled:opacity-60">
          {pending ? "Guardando…" : "Guardar nivel"}
        </button>
      </div>
      {state.ok && state.message ? <p role="status" className="m-0 text-[13.5px] font-extrabold text-ok">✓ {state.message}</p> : null}
      {!state.ok && state.error ? <p role="alert" className="m-0 text-[13.5px] font-bold text-danger">{state.error}</p> : null}
    </form>
  );
}
