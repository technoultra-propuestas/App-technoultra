"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { Select, Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { adjustStockAction, createProductAction, createProductCategoryAction, updateProductAction } from "./actions";

export type ProductValues = {
  id?: string;
  name?: string;
  sku?: string;
  slug?: string;
  category_id?: string | null;
  brand?: string | null;
  description?: string | null;
  price?: number | string;
  warranty_days?: number;
  is_active?: boolean;
};

const Msg = ({ s }: { s: { ok: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> } }) => (
  <>
    {s.error && !s.fieldErrors ? <Alert>{s.error}</Alert> : null}
    {s.ok && s.message ? <Alert tone="ok">{s.message}</Alert> : null}
  </>
);

export function ProductForm({ values, categories }: { values?: ProductValues; categories: { id: string; name: string }[] }) {
  const editing = Boolean(values?.id);
  const [state, action] = useActionState(editing ? updateProductAction : createProductAction, initialState);
  const v = values ?? {};
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      {editing ? <input type="hidden" name="id" value={v.id} /> : null}
      <Field label="Nombre" name="name" defaultValue={v.name} required error={state.fieldErrors?.name} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="SKU" name="sku" defaultValue={v.sku} required error={state.fieldErrors?.sku} />
        <Field label="Marca" name="brand" defaultValue={v.brand ?? ""} />
      </div>
      <Select label="Categoría" name="categoryId" defaultValue={v.category_id ?? ""}>
        <option value="">Sin categoría</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Textarea label="Descripción" name="description" defaultValue={v.description ?? ""} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Precio (COP)" name="price" inputMode="numeric" defaultValue={v.price ?? ""} required error={state.fieldErrors?.price} />
        <Field label="Garantía (días)" name="warrantyDays" inputMode="numeric" defaultValue={v.warranty_days ?? 0} />
      </div>
      <Field label="Slug (opcional)" name="slug" defaultValue={v.slug} />
      <label className="flex items-center gap-3 text-[15px] font-semibold">
        <input type="checkbox" name="isActive" defaultChecked={v.is_active ?? true} className="h-6 w-6 accent-[#FF8A00]" />
        Visible en la tienda
      </label>
      <Msg s={state} />
      <SubmitButton pendingText="Guardando…">{editing ? "Guardar cambios" : "Crear producto"}</SubmitButton>
    </form>
  );
}

export function StockForm({ productId }: { productId: string }) {
  const [state, action] = useActionState(adjustStockAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="productId" value={productId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cantidad (+ entra, − sale)" name="delta" inputMode="numeric" error={state.fieldErrors?.delta} />
        <Select label="Motivo" name="reason" defaultValue="purchase">
          <option value="purchase">Compra / ingreso</option>
          <option value="adjustment">Ajuste de inventario</option>
          <option value="return">Devolución</option>
          <option value="install_use">Uso en instalación</option>
        </Select>
      </div>
      <Field label="Nota (opcional)" name="note" />
      <Msg s={state} />
      <SubmitButton pendingText="Registrando…">Registrar movimiento</SubmitButton>
    </form>
  );
}

export function ProductCategoryForm() {
  const [state, action] = useActionState(createProductCategoryAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <Field label="Nueva categoría" name="name" required error={state.fieldErrors?.name} />
      <Msg s={state} />
      <SubmitButton pendingText="Guardando…">Crear categoría</SubmitButton>
    </form>
  );
}
