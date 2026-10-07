"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { Select, Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { saveEntryAction } from "./actions";

type Entry = { id?: string; category: string; title: string; question: string; answer: string; keywords: string[]; status: string; priority: number; source_type: string | null; source_id: string | null; uses_ai: boolean };
const CATEGORY_LABEL: Record<string, string> = { servicios: "Servicios", precios: "Precios", cobertura: "Cobertura", pagos: "Pagos", tickets: "Tickets", cotizaciones: "Cotizaciones", documentos: "Documentos", garantia: "Garantía", mantenimiento: "Mantenimiento", tienda: "Tienda", ayuda: "Ayuda", general: "General" };

export function EntryForm({ entry }: { entry?: Entry }) {
  const [state, action] = useActionState(saveEntryAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={entry?.id ?? ""} />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <Field label="Título (interno)" name="title" defaultValue={entry?.title} required error={state.fieldErrors?.title} />
      <Field label="Pregunta del cliente" name="question" defaultValue={entry?.question} required error={state.fieldErrors?.question} />
      <Textarea label="Respuesta" name="answer" defaultValue={entry?.answer} required error={state.fieldErrors?.answer} />
      <p className="m-0 -mt-2 text-[13px] leading-snug text-muted">
        Para datos que cambian usa variables: <code>{"{service_name}"}</code>, <code>{"{price}"}</code>, <code>{"{includes}"}</code>, <code>{"{excludes}"}</code> (fuente «Servicio»), <code>{"{cities}"}</code>, <code>{"{home_fees}"}</code> (fuente «Cobertura»), <code>{"{phone}"}</code> (ajuste <code>business.phone</code>). No escribas precios a mano.
      </p>
      <Field label="Palabras clave (separadas por coma)" name="keywords" defaultValue={entry?.keywords.join(", ")} hint="Frases de varias palabras pesan más: «cuanto cuesta», «mercado pago»." error={state.fieldErrors?.keywords} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Categoría" name="category" defaultValue={entry?.category ?? "ayuda"} error={state.fieldErrors?.category}>
          {Object.entries(CATEGORY_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Select label="Estado" name="status" defaultValue={entry?.status ?? "draft"}>
          <option value="draft">Borrador (no se usa)</option>
          <option value="published">Publicada</option>
          <option value="archived">Archivada</option>
        </Select>
        <Select label="Fuente de datos" name="sourceType" defaultValue={entry?.source_type ?? ""}>
          <option value="">Ninguna (texto fijo)</option>
          <option value="service">Servicio</option>
          <option value="coverage">Cobertura</option>
          <option value="setting">Configuración</option>
          <option value="status">Estado del ticket</option>
        </Select>
        <Field label="Identificador de la fuente" name="sourceId" defaultValue={entry?.source_id ?? ""} hint="Slug del servicio (p. ej. diagnostico-basico), clave del ajuste o código del estado." error={state.fieldErrors?.sourceId} />
        <Field label="Prioridad (-100 a 100)" name="priority" inputMode="numeric" defaultValue={String(entry?.priority ?? 0)} error={state.fieldErrors?.priority} />
        <label className="flex min-h-14 items-center gap-3 text-[15px] font-bold">
          <input type="checkbox" name="usesAi" defaultChecked={entry?.uses_ai} className="h-6 w-6 accent-[#FF8A00]" />
          Usa IA (se envía como contexto, no se responde directo)
        </label>
      </div>
      <div className="max-w-[320px]">
        <SubmitButton pendingText="Guardando…">Guardar entrada</SubmitButton>
      </div>
    </form>
  );
}
