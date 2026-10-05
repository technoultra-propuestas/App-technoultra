"use client";

import { useEffect } from "react";
import { clearCart } from "./cart";

/** Al llegar a un pedido recién creado se vacía el carrito local. */
export function ClearCartOnMount() {
  useEffect(() => {
    clearCart();
  }, []);
  return null;
}
