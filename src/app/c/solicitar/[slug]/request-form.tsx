"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, SubmitButton } from "@/components/ui/form";
import { MODALITY_LABEL, Select, Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { COVERAGE_MESSAGE } from "@/lib/domain/requests";
import { createRequestAction } from "../actions";
import { AiPreview } from "./ai-preview";

type Props = {
  serviceId: string;
  modalities: string[];
  requiresEquipment: boolean;
  equipment: { id: string; label: string }[];
  addresses: { id: string; label: string; covered: boolean }[];
  days: { value: string; label: string }[];
};

export function RequestForm({ serviceId, modalities, requiresEquipment, equipment, addresses, days }: Props) {
  const [state, action] = useActionState(createRequestAction, initialState);
  const [modality, setModality] = useState(modalities[0] ?? "remote");
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const physical = modality !== "remote";
  const selected = addresses.find((a) => a.id === addressId);
  // Ayuda visual únicamente: la validación real de cobertura ocurre en el servidor y en la base de datos.
  const uncovered = physical && selected && !selected.covered;

  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <input type="hidden" name="serviceId" value={serviceId} />
      <Select
        label="¿Cómo quieres el servicio?"
        name="modality"
        value={modality}
        onChange={(e) => setModality(e.target.value)}
        error={state.fieldErrors?.modality}
      >
        {modalities.map((m) => (
          <option key={m} value={m}>
            {MODALITY_LABEL[m] ?? m}
          </option>
        ))}
      </Select>

      {requiresEquipment ? (
        equipment.length === 0 ? (
          <Alert>
            Primero registra tu equipo.{" "}
            <Link href="/c/equipos/nuevo" className="underline">
              Agregar equipo
            </Link>
          </Alert>
        ) : (
          <Select label="Equipo" name="equipmentId" defaultValue={equipment[0]?.id}>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </Select>
        )
      ) : null}

      {physical ? (
        addresses.length === 0 ? (
          <Alert>
            Agrega la dirección donde prestaremos el servicio.{" "}
            <Link href="/c/direcciones" className="underline">
              Agregar dirección
            </Link>
          </Alert>
        ) : (
          <Select
            label="Dirección"
            name="addressId"
            value={addressId}
            onChange={(e) => setAddressId(e.target.value)}
          >
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
                {a.covered ? "" : " · sin cobertura presencial"}
              </option>
            ))}
          </Select>
        )
      ) : null}
      {uncovered ? <Alert>{COVERAGE_MESSAGE}</Alert> : null}

      <Textarea
        label="¿Qué está pasando?"
        name="problem"
        placeholder="Ej.: Está muy lento y se demora en prender."
        required
        error={state.fieldErrors?.problem}
      />

      {physical ? (
        <div className="grid grid-cols-2 gap-3">
          <Select label="Día preferido" name="day" defaultValue="">
            <option value="">Sin preferencia</option>
            {days.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
          <Select label="Franja" name="slot" defaultValue="morning">
            <option value="morning">Mañana</option>
            <option value="afternoon">Tarde</option>
          </Select>
        </div>
      ) : null}

      {requiresEquipment || modality !== "remote" ? <AiPreview /> : null}
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingText="Enviando…">Enviar solicitud</SubmitButton>
    </form>
  );
}
