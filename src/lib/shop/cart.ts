/**
 * Carrito del SHOP (consulta por WhatsApp). Guarda SOLO ids y cantidades en el navegador (datos no sensibles). Los precios, nombres e
 * imágenes se consultan al servidor cada vez (`/api/tienda/carrito`): nada del navegador decide un precio ni la disponibilidad.
 * Distinto del carrito de pedidos pagados (`components/store/cart.ts`): este no genera cobro.
 */
export type ShopCartLine = { productId: string; qty: number };

export const SHOP_CART_KEY = "technoultra-shop-cart-v2";
export const SHOP_CART_EVENT = "technoultra-shop-cart";
export const MAX_LINES = 30;
export const MAX_QTY = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lectura defensiva: descarta cualquier cosa que no sea {productId uuid, qty 1..MAX_QTY} y quita repetidos. */
export function parseCart(raw: string | null): ShopCartLine[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    const out: ShopCartLine[] = [];
    for (const l of data) {
      const id = typeof l?.productId === "string" ? l.productId.toLowerCase() : "";
      if (!UUID.test(id) || seen.has(id) || !Number.isInteger(l.qty) || l.qty < 1) continue;
      seen.add(id);
      out.push({ productId: id, qty: Math.min(MAX_QTY, l.qty) });
      if (out.length >= MAX_LINES) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function addLine(cart: ShopCartLine[], productId: string, qty = 1): ShopCartLine[] {
  const id = productId.toLowerCase();
  if (!UUID.test(id)) return cart;
  const next = cart.map((l) => ({ ...l }));
  const found = next.find((l) => l.productId === id);
  if (found) found.qty = Math.min(MAX_QTY, found.qty + qty);
  else if (next.length < MAX_LINES) next.push({ productId: id, qty: Math.min(MAX_QTY, Math.max(1, qty)) });
  return next;
}

export const setQty = (cart: ShopCartLine[], productId: string, qty: number): ShopCartLine[] =>
  qty < 1 ? removeLine(cart, productId) : cart.map((l) => (l.productId === productId ? { ...l, qty: Math.min(MAX_QTY, Math.floor(qty)) } : l));

export const removeLine = (cart: ShopCartLine[], productId: string): ShopCartLine[] => cart.filter((l) => l.productId !== productId);

export const cartCount = (cart: ShopCartLine[]) => cart.reduce((n, l) => n + l.qty, 0);

/** Cantidad total para mostrar en el contador. */
export function readCart(): ShopCartLine[] {
  try {
    return parseCart(localStorage.getItem(SHOP_CART_KEY));
  } catch {
    return [];
  }
}

export function writeCart(cart: ShopCartLine[]) {
  try {
    localStorage.setItem(SHOP_CART_KEY, JSON.stringify(cart));
  } catch {
    /* sin almacenamiento: el carrito vive solo en esta pantalla */
  }
  try {
    window.dispatchEvent(new Event(SHOP_CART_EVENT));
  } catch {
    /* nada */
  }
}
