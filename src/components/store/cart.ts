"use client";

/**
 * Carrito en el navegador (solo ids y cantidades: datos NO sensibles). No guarda precios ni estados:
 * el servidor vuelve a calcular todo al crear el pedido. Nunca se usa para autenticación o permisos.
 */
export type CartLine = { productId: string; qty: number; install?: boolean };
const KEY = "technoultra-cart-v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readCart(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((l): l is CartLine => typeof l?.productId === "string" && UUID.test(l.productId) && Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= 99)
      .slice(0, 30)
      .map((l) => ({ productId: l.productId, qty: l.qty, install: Boolean(l.install) }));
  } catch {
    return [];
  }
}

export function writeCart(lines: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
    window.dispatchEvent(new Event("technoultra-cart"));
  } catch {
    /* sin almacenamiento: el carrito no persiste, la app sigue funcionando */
  }
}

export function addToCart(productId: string, qty = 1) {
  const cart = readCart();
  const found = cart.find((l) => l.productId === productId);
  if (found) found.qty = Math.min(99, found.qty + qty);
  else cart.push({ productId, qty });
  writeCart(cart);
}

export const clearCart = () => writeCart([]);
