"use client";

import { useMemo, useSyncExternalStore } from "react";
import { parseCart, SHOP_CART_EVENT, SHOP_CART_KEY, type ShopCartLine } from "./cart";

const subscribe = (cb: () => void) => {
  window.addEventListener(SHOP_CART_EVENT, cb);
  window.addEventListener("storage", cb); // otras pestañas
  return () => {
    window.removeEventListener(SHOP_CART_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
const snapshot = () => {
  try {
    return localStorage.getItem(SHOP_CART_KEY) ?? "";
  } catch {
    return "";
  }
};

/** Carrito del SHOP como estado reactivo: se actualiza al agregar/quitar en cualquier parte de la página o en otra pestaña. */
export function useShopCart(): ShopCartLine[] {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  return useMemo(() => parseCart(raw || null), [raw]);
}
