"use client";

import { useActionState, useState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { Select, Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import {
  addItemAction,
  answerQuoteAction,
  createQuoteAction,
  inPersonApprovalAction,
  reviseQuoteAction,
  sendQuoteAction,
} from "../quote-actions";

function Result({ state }: { state: { ok: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> } }) {
  return (
    <>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
    </>
  );
}

export function CreateQuoteForm({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState(createQuoteAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <Result state={state} />
      <SubmitButton pendingText="Creando…">Crear cotización</SubmitButton>
    </form>
  );
}

export function AddItemForm({
  ticketId,
  quoteId,
  services,
  products,
}: {
  ticketId: string;
  quoteId: string;
  services: { id: string; name: string }[];
  products: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(addItemAction, initialState);
  const [kind, setKind] = useState<"service" | "product" | "custom">("service");
  const list = kind === "service" ? services : products;
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="quoteId" value={quoteId} />
      <Select label="Tipo de ítem" name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
        <option value="service">Servicio (precio de catálogo)</option>
        <option value="product">Producto (precio de catálogo)</option>
        <option value="custom">Otro / repuesto (precio manual)</option>
      </Select>
      {kind !== "custom" ? (
        <Select label="Ítem" name="refId" error={state.fieldErrors?.refId}>
          {list.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      ) : null}
      {kind === "service" ? <Field label="Valor final (COP)" name="unitPrice" inputMode="numeric" hint='Opcional. En servicios "Desde" debe ser igual o mayor al mínimo; en "a cotizar" es obligatorio.' /> : null}
      {kind === "custom" ? (
        <>
          <Field label="Descripción" name="description" error={state.fieldErrors?.description} />
          <Field label="Precio unitario (COP)" name="unitPrice" inputMode="numeric" />
        </>
      ) : null}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Cantidad" name="qty" inputMode="decimal" defaultValue="1" />
        <Field label="Descuento" name="discount" inputMode="numeric" defaultValue="0" />
        <Field label="Garantía (días)" name="warrantyDays" inputMode="numeric" defaultValue="0" />
      </div>
      {kind === "service" ? (
        <Select label="Tipo de garantía" name="warrantyKind" defaultValue="labor">
          <option value="labor">Mano de obra</option>
          <option value="product">Producto</option>
        </Select>
      ) : null}
      <Result state={state} />
      <SubmitButton pendingText="Agregando…">Agregar ítem</SubmitButton>
    </form>
  );
}

export function QuoteActionForm({
  ticketId,
  quoteId,
  kind,
  label,
  variant = "primary",
  withMessage = false,
}: {
  ticketId: string;
  quoteId: string;
  kind: "send" | "inperson" | "answer" | "revise";
  label: string;
  variant?: "primary" | "dark";
  withMessage?: boolean;
}) {
  const fn = { send: sendQuoteAction, inperson: inPersonApprovalAction, answer: answerQuoteAction, revise: reviseQuoteAction }[kind];
  const [state, action] = useActionState(fn, initialState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="quoteId" value={quoteId} />
      {withMessage ? <Textarea label="Respuesta" name="message" required /> : null}
      <Result state={state} />
      <SubmitButton variant={variant} pendingText="Procesando…">
        {label}
      </SubmitButton>
    </form>
  );
}
