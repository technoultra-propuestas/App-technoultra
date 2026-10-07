"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormDraft } from "@/components/forms/FormDraft";
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
  addresses: { id: string; label: string; covered: Record<string, boolean> }[];
  days: { value: string; label: string }[];
  /** Ruta de esta misma solicitud: se usa como destino de retorno al crear un equipo o una dirección desde aquí. */
  returnPath: string;
  /** Equipo recién creado (llega por la URL al volver): queda seleccionado. */
  initialEquipmentId?: string;
  /** Dirección recién creada (llega por la URL al volver): queda seleccionada. */
  initialAddressId?: string;
};

export function RequestForm({ serviceId, modalities, requiresEquipment, equipment, addresses, days, returnPath, initialEquipmentId, initialAddressId }: Props) {
  const [state, action] = useActionState(createRequestAction, initialState);
  const returnQs = `?returnTo=${encodeURIComponent(returnPath)}`;
  const [modality, setModality] = useState(modalities[0] ?? "remote");
  const [addressId, setAddressId] = useState(addresses.some((a) => a.id === initialAddressId) ? (initialAddressId as string) : (addresses[0]?.id ?? ""));
  // Campos controlados: el botón de la vista previa con IA usa su propia acción y React 19 reinicia los campos no controlados
  // del formulario al terminarla (se borraría lo que la persona ya escribió).
  const [problem, setProblem] = useState("");
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState("morning");
  const [equipmentId, setEquipmentId] = useState(equipment.some((e) => e.id === initialEquipmentId) ? (initialEquipmentId as string) : (equipment[0]?.id ?? ""));
  // La memoria del formulario restaura lo escrito al montar; el equipo/dirección recién creados (llegan por la URL) NO se pisan con un borrador viejo.
  const skipRestore = [...(initialEquipmentId ? ["equipmentId"] : []), ...(initialAddressId ? ["addressId"] : [])];
  const physical = modality !== "remote";
  const selected = addresses.find((a) => a.id === addressId);
  // Ayuda visual únicamente: la validación real de cobertura ocurre en el servidor y en la base de datos.
  const uncovered = physical && selected && selected.covered[modality] === false;

  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <FormDraft id={`solicitud-${serviceId}`} skip={skipRestore} />
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
            Primero registra tu equipo; al guardarlo volverás aquí con el equipo ya seleccionado.{" "}
            <Link href={`/c/equipos/nuevo${returnQs}`} className="inline-flex min-h-11 items-center font-extrabold underline">
              Agregar equipo
            </Link>
          </Alert>
        ) : (
          <Select label="Equipo" name="equipmentId" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
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
            Agrega la dirección donde prestaremos el servicio; al guardarla volverás aquí con ella seleccionada.{" "}
            <Link href={`/c/direcciones${returnQs}`} className="inline-flex min-h-11 items-center font-extrabold underline">
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
                {!physical || a.covered[modality] !== false ? "" : " · sin cobertura presencial"}
              </option>
            ))}
          </Select>
        )
      ) : null}
      {uncovered ? <Alert>{COVERAGE_MESSAGE}</Alert> : null}

      <Textarea
        label="¿Qué está pasando?"
        name="problem"
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
        placeholder="Ej.: Está muy lento y se demora en prender."
        required
        error={state.fieldErrors?.problem}
      />

      {physical ? (
        <div className="grid grid-cols-2 gap-3">
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

      {requiresEquipment || modality !== "remote" ? <AiPreview serviceId={serviceId} equipmentId={requiresEquipment ? equipmentId : ""} problem={problem} /> : null}
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingText="Enviando…">Enviar solicitud</SubmitButton>
    </form>
  );
}
