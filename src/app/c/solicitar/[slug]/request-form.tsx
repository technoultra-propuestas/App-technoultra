"use client";

import { useActionState, useState } from "react";
import { FormDraft } from "@/components/forms/FormDraft";
import { Alert, SubmitButton } from "@/components/ui/form";
import { Select, Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { deliveryOutlook, modalityOptions } from "@/lib/domain/delivery";
import { createRequestAction } from "../actions";
import { AddressPicker, type AddressItem } from "./address-picker";
import { AiPreview } from "./ai-preview";
import { EquipmentPicker, type EquipmentItem } from "./equipment-picker";

type Props = {
  serviceId: string;
  modalities: string[];
  requiresEquipment: boolean;
  equipment: EquipmentItem[];
  addresses: AddressItem[];
  cities: { dane_code: string; city_name: string }[];
  days: { value: string; label: string }[];
  /** Equipo recién creado (llega por la URL al volver de la página de equipos): queda seleccionado. */
  initialEquipmentId?: string;
  /** Dirección recién creada (llega por la URL al volver de la página de direcciones): queda seleccionada. */
  initialAddressId?: string;
};

const TONE: Record<string, string> = {
  fee: "border-line bg-white text-ink",
  free: "border-line bg-white text-ink",
  fee_missing: "border-brand bg-[#FFF6E8] text-ink",
  uncovered: "border-[#E5B5AE] bg-[#FBEDEA] text-[#7A1F14]",
  no_address: "border-line bg-paper text-ink-2",
};

export function RequestForm({ serviceId, modalities, requiresEquipment, equipment, addresses, cities, days, initialEquipmentId, initialAddressId }: Props) {
  const [state, action] = useActionState(createRequestAction, initialState);
  const options = modalityOptions(modalities);
  const firstEnabled = options.find((o) => o.enabled)?.value ?? "remote";
  const [modality, setModality] = useState(firstEnabled);
  const [eqList, setEqList] = useState(equipment);
  const [equipmentId, setEquipmentId] = useState(eqList.some((e) => e.id === initialEquipmentId) ? (initialEquipmentId as string) : (eqList[0]?.id ?? ""));
  const [addrList, setAddrList] = useState(addresses);
  const [addressId, setAddressId] = useState(addrList.some((a) => a.id === initialAddressId) ? (initialAddressId as string) : (addrList[0]?.id ?? ""));
  // Campos controlados: el botón de la vista previa con IA usa su propia acción y React 19 reinicia los campos no controlados
  // del formulario al terminarla (se borraría lo que la persona ya escribió).
  const [problem, setProblem] = useState("");
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState("morning");
  const [localError, setLocalError] = useState("");
  // La memoria del formulario restaura lo escrito al montar; el equipo/dirección recién creados NO se pisan con un borrador viejo.
  const skipRestore = [...(initialEquipmentId ? ["equipmentId"] : []), ...(initialAddressId ? ["addressId"] : [])];
  // Regla del negocio (también en la base de datos): todo servicio no remoto necesita una dirección (confirma la cobertura de la ciudad).
  const needsAddress = modality !== "remote";
  const selected = addrList.find((a) => a.id === addressId);
  const outlook = deliveryOutlook(modality, selected?.zone ?? null);
  const aiNeedsEquipment = requiresEquipment || modality !== "remote";

  function onSubmit(e: { preventDefault: () => void }) {
    // Ayuda de usabilidad; la validación real (cobertura, propiedad, tarifa) ocurre en el servidor y en la base de datos.
    if (requiresEquipment && !equipmentId) {
      e.preventDefault();
      return setLocalError("Elige un equipo registrado o guarda uno nuevo antes de enviar la solicitud.");
    }
    if (needsAddress && !addressId) {
      e.preventDefault();
      return setLocalError("Elige una dirección registrada o guarda una nueva antes de enviar la solicitud.");
    }
    if (outlook.kind === "uncovered") {
      e.preventDefault();
      return setLocalError(outlook.text);
    }
    setLocalError("");
  }

  return (
    <form data-request-form action={action} onSubmit={onSubmit} className="flex flex-col gap-[18px] lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-5" noValidate>
      <FormDraft id={`solicitud-${serviceId}`} skip={skipRestore} />
      <input type="hidden" name="serviceId" value={serviceId} />

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0 lg:col-span-2">
        <legend className="mb-2 p-0 text-[15px] font-bold">¿Cómo quieres el servicio?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((o) => (
            <label
              key={o.value}
              className={`flex min-h-[64px] items-start gap-3 rounded-card border-[1.5px] p-4 ${o.enabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"} ${modality === o.value ? "border-brand bg-[#FFF6E8]" : "border-line-strong bg-white"}`}
            >
              <input type="radio" name="modality" value={o.value} checked={modality === o.value} disabled={!o.enabled} onChange={() => { setModality(o.value); setLocalError(""); }} className="mt-1 h-5 w-5 flex-none accent-[#FF8A00]" />
              <span className="flex min-w-0 flex-col">
                <span className="text-[16px] font-extrabold">{o.label}</span>
                {o.reason ? <span className="text-[13px] font-semibold text-muted">{o.reason}</span> : null}
              </span>
            </label>
          ))}
        </div>
        {state.fieldErrors?.modality ? <span className="text-[13px] font-bold text-[#9A2B1E]">{state.fieldErrors.modality}</span> : null}
      </fieldset>

      {requiresEquipment ? (
        <div className="min-w-0">
          <EquipmentPicker
            items={eqList}
            selectedId={equipmentId}
            onSelect={setEquipmentId}
            onCreated={(item) => {
              setEqList((l) => (l.some((x) => x.id === item.id) ? l : [item, ...l]));
              setEquipmentId(item.id);
              setLocalError("");
            }}
          />
        </div>
      ) : null}

      {needsAddress ? (
        <div className="min-w-0">
          <AddressPicker
            items={addrList}
            selectedId={addressId}
            modality={modality}
            modalities={modalities}
            cities={cities}
            onSelect={setAddressId}
            onCreated={(item) => {
              setAddrList((l) => (l.some((x) => x.id === item.id) ? l : [item, ...l]));
              setAddressId(item.id);
              setLocalError("");
            }}
          />
        </div>
      ) : null}

      {outlook.kind !== "none" ? (
        <div role="status" data-delivery={outlook.kind} className={`flex flex-col gap-1 rounded-card border-[1.5px] p-4 text-[14px] font-semibold leading-snug lg:col-span-2 ${TONE[outlook.kind]}`}>
          <span className="text-[12px] font-extrabold uppercase tracking-[0.05em] text-muted">{modality === "home" ? "Domicilio" : "Recogida"}</span>
          {outlook.text}
        </div>
      ) : null}

      <div className="lg:col-span-2">
        <Textarea
          label="¿Qué está pasando?"
          name="problem"
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          placeholder="Ej.: Está muy lento y se demora en prender."
          required
          error={state.fieldErrors?.problem}
        />
      </div>

      {modality !== "remote" ? (
        <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:max-w-[520px]">
          <Select label="Día preferido" name="day" value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">Sin preferencia</option>
            {days.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
          <Select label="Franja" name="slot" value={slot} onChange={(e) => setSlot(e.target.value)}>
            <option value="morning">Mañana</option>
            <option value="afternoon">Tarde</option>
          </Select>
        </div>
      ) : null}

      {aiNeedsEquipment ? (
        <div className="lg:col-span-2">
          <AiPreview serviceId={serviceId} equipmentId={requiresEquipment ? equipmentId : ""} problem={problem} />
        </div>
      ) : null}
      <div className="flex flex-col gap-3 lg:col-span-2">
        {localError ? <Alert>{localError}</Alert> : null}
        {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
        <SubmitButton pendingText="Enviando…">Enviar solicitud</SubmitButton>
      </div>
    </form>
  );
}
