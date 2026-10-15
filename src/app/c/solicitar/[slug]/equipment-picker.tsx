"use client";

import { useRef, useState } from "react";
import { Alert, Field } from "@/components/ui/form";
import { EQUIPMENT_LABEL, Select } from "@/components/ui/layout";
import { quickCreateEquipment } from "../inline-actions";

export type EquipmentItem = { id: string; label: string };
type Mode = "existing" | "new";

const TYPES: [string, string][] = [
  ["laptop", "Portátil"],
  ["desktop", "Escritorio"],
  ["all_in_one", "Todo en uno"],
  ["printer", "Impresora"],
  ["network", "Red / router"],
  ["other", "Otro"],
];

const tab = (on: boolean) => `press min-h-11 flex-1 rounded-[12px] px-3 text-[14px] font-extrabold ${on ? "bg-ink text-white" : "border border-line-strong bg-white text-ink"}`;

/**
 * Elegir un equipo registrado o registrar uno NUEVO sin salir de la solicitud. Al guardarlo queda seleccionado y la solicitud conserva todo lo
 * ya escrito (el formulario no se reinicia). El servidor crea el equipo para el cliente de la sesión y evita duplicados por doble clic.
 */
export function EquipmentPicker({ items, selectedId, onSelect, onCreated }: { items: EquipmentItem[]; selectedId: string; onSelect: (id: string) => void; onCreated: (item: EquipmentItem) => void }) {
  const [mode, setMode] = useState<Mode>(items.length ? "existing" : "new");
  const [f, setF] = useState({ type: "laptop", brand: "", model: "", serial: "", ram: "", storage: "", year: "" });
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
      const r = await quickCreateEquipment(f);
      if (!r.ok) return setErr({ error: r.error, fields: r.fieldErrors });
      onCreated({ id: r.equipment.id, label: `${EQUIPMENT_LABEL[r.equipment.type] ?? r.equipment.type} · ${r.equipment.brand} ${r.equipment.model}` });
      setF({ type: "laptop", brand: "", model: "", serial: "", ram: "", storage: "", year: "" });
      setMode("existing");
    } catch {
      setErr({ error: "No pudimos guardar el equipo. Revisa tu conexión e inténtalo de nuevo." });
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-2 p-0 text-[15px] font-bold">Equipo</legend>
      <div role="group" aria-label="Equipo: registrado o nuevo" className="flex gap-2">
        <button type="button" disabled={items.length === 0} aria-pressed={mode === "existing"} onClick={() => setMode("existing")} className={`${tab(mode === "existing")} disabled:opacity-50`}>
          Usar uno registrado
        </button>
        <button type="button" aria-pressed={mode === "new"} onClick={() => setMode("new")} className={tab(mode === "new")}>
          Registrar uno nuevo
        </button>
      </div>
      {mode === "existing" && items.length > 0 ? (
        <Select label="Equipo registrado" name="equipmentId" value={selectedId} onChange={(e) => onSelect(e.target.value)}>
          {items.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </Select>
      ) : null}
      {mode === "new" ? (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-white p-4" data-inline-form="equipo">
          <Select label="Tipo de equipo" name="eq_type" value={f.type} onChange={set("type")} error={err.fields?.type}>
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Marca" name="eq_brand" value={f.brand} onChange={set("brand")} error={err.fields?.brand} required />
            <Field label="Modelo" name="eq_model" value={f.model} onChange={set("model")} error={err.fields?.model} required />
          </div>
          <Field label="Serial (opcional)" name="eq_serial" value={f.serial} onChange={set("serial")} hint="Lo encuentras en una etiqueta del equipo." />
          <details className="rounded-[12px] border border-line p-3">
            <summary className="cursor-pointer text-[14px] font-extrabold">Más datos (opcional)</summary>
            <div className="grid gap-3 pt-3 sm:grid-cols-3">
              <Field label="Memoria RAM" name="eq_ram" value={f.ram} onChange={set("ram")} placeholder="8 GB" />
              <Field label="Almacenamiento" name="eq_storage" value={f.storage} onChange={set("storage")} placeholder="SSD 256 GB" />
              <Field label="Año" name="eq_year" value={f.year} onChange={set("year")} inputMode="numeric" error={err.fields?.year} />
            </div>
          </details>
          {err.error ? <Alert>{err.error}</Alert> : null}
          <button type="button" onClick={() => void save()} disabled={busy} className="press min-h-12 rounded-[14px] bg-brand px-5 text-[15px] font-extrabold text-ink disabled:opacity-60">
            {busy ? "Guardando…" : "Guardar equipo y seleccionarlo"}
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}
