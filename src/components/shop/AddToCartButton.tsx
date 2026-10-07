"use client";

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { addLine, readCart, writeCart } from "@/lib/shop/cart";

/** «+ Agregar»: suma el producto al carrito del SHOP (solo id y cantidad en el navegador) y confirma con un cambio de estado breve. */
export function AddToCartButton({ productId, label = "+ Agregar", size = "compact", className = "" }: { productId: string; label?: string; size?: "compact" | "large"; className?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          writeCart(addLine(readCart(), productId));
          haptic("success");
          setDone(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setDone(false), 1600);
        }}
        className={`press inline-flex w-full items-center justify-center rounded-[12px] font-extrabold text-ink transition-colors duration-200 ${done ? "bg-ok-soft text-ok" : "bg-brand"} ${size === "large" ? "min-h-[52px] text-[16px]" : "min-h-11 text-[14px]"} ${className}`}
      >
        {done ? "✓ Agregado" : label}
      </button>
      <span role="status" className="sr-only">
        {done ? "Producto agregado al carrito" : ""}
      </span>
    </>
  );
}
