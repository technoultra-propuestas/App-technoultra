export type PriceFields = {
  price_mode: "fixed" | "from" | "quote";
  base_price: number | string | null;
  price_unit: string | null;
};

const money = (n: number | string) => "$" + Math.round(Number(n)).toLocaleString("es-CO");

/** Texto de precio mostrado al cliente. Siempre viene de la base de datos (nunca de valores fijos en el código). */
export const priceText = (s: PriceFields): string =>
  s.price_mode === "quote" || s.base_price == null
    ? "A cotizar"
    : `${s.price_mode === "from" ? "Desde " : ""}${money(s.base_price)}${s.price_unit ?? ""}`;
