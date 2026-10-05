export type PriceFields = {
  price_mode: "fixed" | "from" | "quote";
  base_price: number | string | null;
  price_unit: string | null;
  price_type_label?: string | null;
  parts_extra?: boolean | null;
};

const money = (n: number | string) => "$" + Math.round(Number(n)).toLocaleString("es-CO");

/**
 * Texto de precio mostrado al cliente. Siempre viene de la base de datos (nunca de valores fijos en el código).
 * Respeta "Desde" (mínimo), "Gratis" y "+ repuesto" (mano de obra: el repuesto se cotiza aparte).
 */
export const priceText = (s: PriceFields): string => {
  if (s.price_mode === "quote" || s.base_price == null) return "A cotizar";
  if (Number(s.base_price) === 0 && s.price_type_label === "Gratis") return "Gratis";
  return `${s.price_mode === "from" ? "Desde " : ""}${money(s.base_price)}${s.price_unit ?? ""}${s.parts_extra ? " + repuesto" : ""}`;
};
