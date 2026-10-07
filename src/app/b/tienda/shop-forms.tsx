"use client";

import { useActionState } from "react";
import { FormDraft } from "@/components/forms/FormDraft";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { Select, Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { saveBannerAction, saveShopSettingsAction } from "./shop-actions";

const Msg = ({ s }: { s: { ok: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> } }) => (
  <>
    {s.error && !s.fieldErrors ? <Alert>{s.error}</Alert> : null}
    {s.ok && s.message ? <Alert tone="ok">{s.message}</Alert> : null}
  </>
);
const Check = ({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) => (
  <label className="flex min-h-11 items-center gap-3 text-[15px] font-bold">
    <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-5 w-5 accent-brand" />
    {label}
  </label>
);

export type ShopSettingsValues = {
  title: string;
  subtitle: string | null;
  show_featured: boolean;
  shipping_enabled: boolean;
  shipping_title: string;
  shipping_urban_fee: number;
  shipping_outside_fee: number;
  shipping_note: string;
  whatsapp_intro: string;
  whatsapp_closing: string;
};

export function ShopSettingsForm({ v }: { v: ShopSettingsValues }) {
  const [state, action] = useActionState(saveShopSettingsAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Título de la sección" name="title" defaultValue={v.title} required error={state.fieldErrors?.title} />
        <Field label="Subtítulo" name="subtitle" defaultValue={v.subtitle ?? ""} error={state.fieldErrors?.subtitle} />
      </div>
      <Check name="showFeatured" label="Mostrar la fila de productos destacados" defaultChecked={v.show_featured} />
      <fieldset className="m-0 flex flex-col gap-3 rounded-[14px] border border-line p-4">
        <legend className="px-1 text-[13px] font-extrabold uppercase tracking-[0.04em] text-muted">Envíos de productos</legend>
        <Check name="shippingEnabled" label="Mostrar la franja de envíos" defaultChecked={v.shipping_enabled} />
        <Field label="Título de la franja" name="shippingTitle" defaultValue={v.shipping_title} error={state.fieldErrors?.shippingTitle} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cali urbano (COP)" name="shippingUrbanFee" inputMode="numeric" defaultValue={String(v.shipping_urban_fee)} error={state.fieldErrors?.shippingUrbanFee} />
          <Field label="Fuera del perímetro / zonas aledañas (COP)" name="shippingOutsideFee" inputMode="numeric" defaultValue={String(v.shipping_outside_fee)} error={state.fieldErrors?.shippingOutsideFee} />
        </div>
        <Field label="Nota" name="shippingNote" defaultValue={v.shipping_note} hint="Es informativo: el domicilio no se cobra en la app y no cambia las tarifas de los servicios técnicos." />
      </fieldset>
      <fieldset className="m-0 flex flex-col gap-3 rounded-[14px] border border-line p-4">
        <legend className="px-1 text-[13px] font-extrabold uppercase tracking-[0.04em] text-muted">Mensaje de WhatsApp del carrito</legend>
        <Textarea label="Introducción" name="whatsappIntro" defaultValue={v.whatsapp_intro} rows={2} error={state.fieldErrors?.whatsappIntro} />
        <Textarea label="Cierre" name="whatsappClosing" defaultValue={v.whatsapp_closing} rows={2} error={state.fieldErrors?.whatsappClosing} />
        <p className="m-0 text-[13px] text-muted">El mensaje siempre incluye cada producto con su referencia, precio publicado y cantidad, el subtotal y «Entrega: pendiente de confirmar».</p>
      </fieldset>
      <Msg s={state} />
      <SubmitButton pendingText="Guardando…">Guardar ajustes</SubmitButton>
    </form>
  );
}

export type BannerValues = { id?: string; title?: string; subtitle?: string | null; image_url?: string | null; cta_label?: string | null; cta_href?: string | null; tone?: string; is_active?: boolean; priority?: number; starts_at?: string | null; ends_at?: string | null };

/** Fecha ISO → valor de <input type="datetime-local"> en hora de Colombia. */
const toLocal = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - 5 * 3600_000);
  return d.toISOString().slice(0, 16);
};

export function BannerForm({ v }: { v?: BannerValues }) {
  const [state, action] = useActionState(saveBannerAction, initialState);
  const editing = Boolean(v?.id);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {editing ? null : <FormDraft id="banner-nuevo" />}
      {editing ? <input type="hidden" name="id" value={v?.id} /> : null}
      <Field label="Título" name="title" defaultValue={v?.title} required error={state.fieldErrors?.title} />
      <Field label="Subtítulo" name="subtitle" defaultValue={v?.subtitle ?? ""} error={state.fieldErrors?.subtitle} />
      <Field label="Imagen (enlace https)" name="imageUrl" defaultValue={v?.image_url ?? ""} placeholder="https://res.cloudinary.com/…" error={state.fieldErrors?.imageUrl} hint="Opcional. Se recorta automáticamente; en móvil se muestra solo el texto." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Texto del botón" name="ctaLabel" defaultValue={v?.cta_label ?? ""} placeholder="Ver ofertas" error={state.fieldErrors?.ctaLabel} />
        <Field label="Enlace del botón" name="ctaHref" defaultValue={v?.cta_href ?? ""} placeholder="/tienda/categoria/componentes" error={state.fieldErrors?.ctaHref} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Estilo" name="tone" defaultValue={v?.tone ?? "dark"}>
          <option value="dark">Oscuro</option>
          <option value="brand">Naranja TechnoUltra</option>
          <option value="light">Claro</option>
        </Select>
        <Field label="Prioridad (mayor se muestra primero)" name="priority" inputMode="numeric" defaultValue={String(v?.priority ?? 0)} error={state.fieldErrors?.priority} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Desde (opcional)" name="startsAt" type="datetime-local" defaultValue={toLocal(v?.starts_at)} />
        <Field label="Hasta (opcional)" name="endsAt" type="datetime-local" defaultValue={toLocal(v?.ends_at)} />
      </div>
      <Check name="isActive" label="Promoción activa" defaultChecked={v?.is_active ?? false} />
      <Msg s={state} />
      <SubmitButton pendingText="Guardando…">{editing ? "Guardar banner" : "Crear banner"}</SubmitButton>
    </form>
  );
}
