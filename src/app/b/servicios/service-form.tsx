"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { MODALITY_LABEL, Select, Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { createCategoryAction, createServiceAction, updateServiceAction } from "./actions";

export type ServiceValues = {
  id?: string;
  name?: string;
  slug?: string;
  kind?: string;
  category_id?: string | null;
  short_description?: string | null;
  description?: string | null;
  price_mode?: string;
  base_price?: number | string | null;
  price_unit?: string | null;
  duration_minutes?: number | null;
  allowed_modalities?: string[];
  requires_equipment?: boolean;
  requires_diagnosis?: boolean;
  requires_quote?: boolean;
  default_warranty_days?: number;
  default_warranty_kind?: string;
  seo_title?: string | null;
  seo_description?: string | null;
  is_active?: boolean;
};

const Check = ({ name, label, checked }: { name: string; label: string; checked: boolean }) => (
  <label className="flex items-center gap-3 text-[15px] font-semibold">
    <input type="checkbox" name={name} defaultChecked={checked} className="h-6 w-6 accent-[#FF8A00]" />
    {label}
  </label>
);

export function ServiceForm({ values, categories }: { values?: ServiceValues; categories: { id: string; name: string; kind: string }[] }) {
  const editing = Boolean(values?.id);
  const [state, action] = useActionState(editing ? updateServiceAction : createServiceAction, initialState);
  const v = values ?? {};
  const mods = v.allowed_modalities ?? ["store", "pickup", "home"];
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      {editing ? <input type="hidden" name="id" value={v.id} /> : null}
      <Field label="Nombre" name="name" defaultValue={v.name} required error={state.fieldErrors?.name} />
      <Field label="Slug (URL)" name="slug" defaultValue={v.slug} hint="Opcional: se genera del nombre." />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Tipo" name="kind" defaultValue={v.kind ?? "technical"}>
          <option value="technical">Servicio técnico</option>
          <option value="digital">Solución digital</option>
        </Select>
        <Select label="Categoría" name="categoryId" defaultValue={v.category_id ?? ""}>
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.kind === "digital" ? "digital" : "técnico"})
            </option>
          ))}
        </Select>
      </div>
      <Field label="Descripción corta" name="shortDescription" defaultValue={v.short_description ?? ""} />
      <Textarea label="Descripción" name="description" defaultValue={v.description ?? ""} />
      <div className="grid grid-cols-3 gap-3">
        <Select label="Precio" name="priceMode" defaultValue={v.price_mode ?? "fixed"}>
          <option value="fixed">Fijo</option>
          <option value="from">Desde</option>
          <option value="quote">A cotizar</option>
        </Select>
        <Field label="Valor base (COP)" name="basePrice" inputMode="numeric" defaultValue={v.base_price ?? ""} error={state.fieldErrors?.basePrice} />
        <Field label="Unidad" name="priceUnit" defaultValue={v.price_unit ?? ""} placeholder="/mes" />
      </div>
      <Field label="Duración (minutos)" name="durationMinutes" inputMode="numeric" defaultValue={v.duration_minutes ?? ""} />
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-[15px] font-bold">Modalidades disponibles</legend>
        {(["store", "pickup", "home", "remote"] as const).map((m) => (
          <label key={m} className="flex items-center gap-3 text-[15px] font-semibold">
            <input type="checkbox" name="modalities" value={m} defaultChecked={mods.includes(m)} className="h-6 w-6 accent-[#FF8A00]" />
            {MODALITY_LABEL[m]}
          </label>
        ))}
        {state.fieldErrors?.modalities ? <span className="text-[13px] font-bold text-[#9A2B1E]">{state.fieldErrors.modalities}</span> : null}
      </fieldset>
      <div className="flex flex-col gap-2">
        <Check name="requiresEquipment" label="Requiere un equipo registrado" checked={v.requires_equipment ?? true} />
        <Check name="requiresDiagnosis" label="Requiere diagnóstico previo" checked={v.requires_diagnosis ?? true} />
        <Check name="requiresQuote" label="Requiere cotización y aprobación" checked={v.requires_quote ?? true} />
        <Check name="isActive" label="Visible para los clientes" checked={v.is_active ?? true} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Garantía (días)" name="warrantyDays" inputMode="numeric" defaultValue={v.default_warranty_days ?? 0} />
        <Select label="Tipo de garantía" name="warrantyKind" defaultValue={v.default_warranty_kind ?? "labor"}>
          <option value="labor">Mano de obra</option>
          <option value="product">Producto</option>
        </Select>
      </div>
      <Field label="Título SEO" name="seoTitle" defaultValue={v.seo_title ?? ""} hint="Máximo 70 caracteres." />
      <Field label="Descripción SEO" name="seoDescription" defaultValue={v.seo_description ?? ""} hint="Máximo 170 caracteres." />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Guardando…">{editing ? "Guardar cambios" : "Crear servicio"}</SubmitButton>
    </form>
  );
}

export function CategoryForm() {
  const [state, action] = useActionState(createCategoryAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <Field label="Nombre de la categoría" name="name" required error={state.fieldErrors?.name} />
      <Select label="Tipo" name="kind" defaultValue="technical">
        <option value="technical">Servicio técnico</option>
        <option value="digital">Solución digital</option>
      </Select>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingText="Guardando…">Crear categoría</SubmitButton>
    </form>
  );
}
