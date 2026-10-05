"use client";

import { useState } from "react";
import { addToCart } from "./cart";

export function AddToCart({ productId, disabled }: { productId: string; disabled?: boolean }) {
  const [added, setAdded] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        addToCart(productId);
        setAdded(true);
        navigator.vibrate?.(12);
        setTimeout(() => setAdded(false), 1800);
      }}
      className="min-h-12 rounded-2xl bg-brand px-5 text-[15px] font-extrabold text-ink disabled:bg-[#EDEDEA] disabled:text-muted"
    >
      {disabled ? "Sin stock" : added ? "Agregado ✓" : "Agregar al carrito"}
    </button>
  );
}
