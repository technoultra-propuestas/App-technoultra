"use client";

import { useRef, useState } from "react";
import { Alert, Field } from "@/components/ui/form";
import { Select } from "@/components/ui/layout";
import { deliveryOutlook, type Zone } from "@/lib/domain/delivery";
import { quickCreateAddress } from "../inline-actions";

export type AddressItem = { id: string; label: string; zone: Zone };
type Mode = "existing" | "new";

const tab = (on: boolean) => `press min-h-11 flex-1 rounded-[12px] px-3 text-[14px] font-extrabold ${on ? "bg-ink text-white" : "border border-line-strong bg-white text-ink"}`;
const MODALITY_NAME: Record<string, string> = { home: "domicilio", pickup: "recogida", store: "el local" };

/**
 * Elegir una dirección registrada o registrar una NUEVA (casa, oficina, otra sede…) sin salir de la solicitud y sin reemplazar las anteriores.
 * Al guardarla se muestra de inmediato si admite domicilio y su tarifa. Registrar una dirección fuera de cobertura es posible, pero NO habilita
 * un domicilio allí: el servidor valida la cobertura otra vez al crear la solicitud.
 */
export function AddressPicker({
  items,
  selectedId,
  modality,
  modalities,
  cities,
  onSelect,
  onCreated,
}: {
  items: AddressItem[];
  selectedId: string;
  modality: string;
  modalities: string[];
  cities: { dane_code: string; city_name: string }[];
  onSelect: (id: string) => void;
  onCreated: (item: AddressItem) => void;
}) {
  const [mode, setMode] = useState<Mode>(items.length ? "existing" : "new");
  const [f, setF] = useState({ label: "Casa", dane: cities[0]?.dane_code ?? "other", otherCity: "", otherDept: "", line1: "", neighborhood: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false); // guardia inmediata contra el doble clic (el estado de React se actualiza después del segundo clic)
  const [err, setErr] = useState<{ error?: string; fields?: Record<string, string> }>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setErr({});
    try {
      const r = await quickCreateAddress(f, modalities);
      if (!r.ok) return setErr({ error: r.error, fields: r.fieldErrors });
      onCreated({ id: r.address.id, label: `${r.address.label} · ${r.address.line1}, ${r.address.city_name}`, zone: r.address.zone });
      setF((p) => ({ ...p, label: "Casa", line1: "", neighborhood: "", notes: "", otherCity: "", otherDept: "" }));
      setMode("existing");
    } catch {
      setErr({ error: "No pudimos guardar la dirección. Revisa tu conexión e inténtalo de nuevo." });
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-2 p-0 text-[15px] font-bold">Dirección</legend>
      <div role="group" aria-label="Dirección: registrada o nueva" className="flex gap-2">
        <button type="button" disabled={items.length === 0} aria-pressed={mode === "existing"} onClick={() => setMode("existing")} className={`${tab(mode === "existing")} disabled:opacity-50`}>
          Usar una registrada
        </button>
        <button type="button" aria-pressed={mode === "new"} onClick={() => setMode("new")} className={tab(mode === "new")}>
          Registrar una nueva
        </button>
      </div>
      {mode === "existing" && items.length > 0 ? (
        <Select label="Dirección registrada" name="addressId" value={selectedId} onChange={(e) => onSelect(e.target.value)}>
          {items.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
              {a.zone.covered[modality] === false ? ` · sin cobertura de ${MODALITY_NAME[modality] ?? "este servicio"}` : ""}
            </option>
          ))}
        </Select>
      ) : null}
      {mode === "new" ? (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-white p-4" data-inline-form="direccion">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre (Casa, Oficina, Sede 2…)" name="ad_label" value={f.label} onChange={set("label")} />
            <Select label="Ciudad o municipio" name="ad_dane" value={f.dane} onChange={set("dane")} error={err.fields?.dane}>
              {cities.map((c) => (
                <option key={c.dane_code} value={c.dane_code}>
                  {c.city_name}
                </option>
              ))}
              <option value="other">Otra ciudad (solo soporte remoto)</option>
            </Select>
          </div>
          {f.dane === "other" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ciudad" name="ad_otherCity" value={f.otherCity} onChange={set("otherCity")} required />
              <Field label="Departamento" name="ad_otherDept" value={f.otherDept} onChange={set("otherDept")} required />
            </div>
          ) : null}
          <Field label="Dirección" name="ad_line1" value={f.line1} onChange={set("line1")} autoComplete="street-address" error={err.fields?.line1} required />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Barrio o sector (opcional)" name="ad_neighborhood" value={f.neighborhood} onChange={set("neighborhood")} />
            <Field label="Indicaciones de acceso (opcional)" name="ad_notes" value={f.notes} onChange={set("notes")} hint="Torre, apartamento, portería, referencias." />
          </div>
          {err.error ? <Alert>{err.error}</Alert> : null}
          <button type="button" onClick={() => void save()} disabled={busy} className="press min-h-12 rounded-[14px] bg-brand px-5 text-[15px] font-extrabold text-ink disabled:opacity-60">
            {busy ? "Guardando…" : "Guardar dirección y seleccionarla"}
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}

export { deliveryOutlook };
