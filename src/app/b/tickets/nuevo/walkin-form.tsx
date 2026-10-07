"use client";

import { useActionState, useState } from "react";
import { FormDraft } from "@/components/forms/FormDraft";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { EQUIPMENT_LABEL, MODALITY_LABEL, Select, Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { createWalkinAction } from "./actions";

type Props = {
  customers: { id: string; name: string; phone: string | null }[];
  equipment: { id: string; customer_id: string; label: string }[];
  services: { id: string; name: string }[];
  canSearch: boolean;
};

export function WalkinForm({ customers, equipment, services, canSearch }: Props) {
  const [state, action] = useActionState(createWalkinAction, initialState);
  const [customerId, setCustomerId] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const eq = equipment.filter((e) => e.customer_id === customerId);
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <FormDraft id="ticket-mostrador" />
      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="mb-2 text-[17px] font-extrabold">Cliente</legend>
        {canSearch ? (
          <Select label="Cliente existente" name="customerId" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setEquipmentId(""); }}>
            <option value="">Cliente nuevo…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </Select>
        ) : null}
        {!customerId ? (
          <>
            <Field label="Nombre completo" name="newName" autoComplete="off" />
            <Field label="Celular" name="newPhone" type="tel" inputMode="tel" autoComplete="off" />
            <Field label="Correo (opcional)" name="newEmail" type="email" autoComplete="off" />
          </>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="mb-2 text-[17px] font-extrabold">Equipo</legend>
        {eq.length > 0 ? (
          <Select label="Equipo registrado" name="equipmentId" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
            <option value="">Equipo nuevo…</option>
            {eq.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </Select>
        ) : null}
        {!equipmentId ? (
          <>
            <Select label="Tipo" name="eqType" defaultValue="laptop">
              {Object.entries(EQUIPMENT_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Marca" name="eqBrand" />
              <Field label="Modelo" name="eqModel" />
            </div>
            <Field label="Serial (opcional)" name="eqSerial" />
          </>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="mb-2 text-[17px] font-extrabold">Servicio</legend>
        <Select label="Servicio solicitado" name="serviceId" defaultValue="">
          <option value="">Por definir en el diagnóstico</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select label="Modalidad" name="modality" defaultValue="store">
          {Object.entries(MODALITY_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Textarea label="Problema que reporta el cliente" name="problem" required error={state.fieldErrors?.problem} />
      </fieldset>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingText="Creando ticket…">Crear ticket y continuar a la recepción</SubmitButton>
    </form>
  );
}
