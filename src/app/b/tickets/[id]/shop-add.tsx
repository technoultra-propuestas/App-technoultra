"use client";

import { useActionState } from "react";
import { IconPlus } from "@/components/ui/icons";
import { addShopProductToQuoteAction, type ShopAddResult } from "../quote-actions";

/** Botón «Agregar a cotización» de UN producto recomendado; la respuesta (agregado, cantidad o motivo) aparece junto al botón. */
export function AddShopProductButton({ ticketId, productId, name }: { ticketId: string; productId: string; name: string }) {
  const [state, action, pending] = useActionState<ShopAddResult | null, FormData>(addShopProductToQuoteAction, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="productId" value={productId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Agregar ${name} a la cotización`}
        className="press inline-flex min-h-10 items-center gap-1.5 rounded-[12px] border-[1.5px] border-line-strong bg-white px-3 text-[13px] font-extrabold text-ink disabled:opacity-60"
      >
        <IconPlus width={16} height={16} />
        {pending ? "Agregando…" : "Agregar a cotización"}
      </button>
      {state ? (
        <span role={state.ok ? "status" : "alert"} className={`max-w-[240px] text-right text-[12px] font-bold ${state.ok ? "text-ok" : "text-danger"}`}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
