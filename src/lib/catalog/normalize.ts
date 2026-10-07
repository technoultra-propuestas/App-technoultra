import { MARKUP_PERCENT } from "./config";

/** Espacios repetidos y bordes fuera. No cambia mayúsculas ni acentos (el nombre comercial se conserva). */
export const normText = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Clave de identidad: sin acentos, minúsculas y espacios colapsados («Periféricos » = «PERIFERICOS»). Igual a `private.norm_key` en SQL. */
export const normKey = (s: string | null | undefined) =>
  normText(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Identificador estable del producto en la fuente: la referencia normalizada en mayúsculas. */
export const normRef = (s: string | null | undefined) => normText(s).toUpperCase();

/**
 * Precio al cliente = precio fuente + 20 % (de la fuente, no del final). Aritmética entera exacta en COP (sin coma flotante):
 * 100 000 → 120 000 · 110 000 → 132 000 · 90 000 → 108 000 · 333 333 → 400 000.
 */
export const customerPrice = (sourcePrice: number): number => {
  if (!Number.isFinite(sourcePrice) || sourcePrice <= 0) throw new RangeError("invalid_source_price");
  const base = Math.round(sourcePrice);
  return Math.floor((base * (100 + MARKUP_PERCENT) + 50) / 100);
};

/** Importe en pesos colombianos: «$120.000». */
export const copFormat = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

/** Hash corto y estable (FNV-1a de 32 bits) para desambiguar referencias repetidas con nombres distintos. */
export const shortHash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 6);
};
