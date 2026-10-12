import { normKey } from "./normalize";

/**
 * Búsqueda de productos para cotizar (personal). Se resuelve en el SERVIDOR con una consulta acotada; el navegador nunca descarga el
 * catálogo. Tolerancia a acentos sin cambiar la base de datos: cada vocal del término se vuelve el comodín de un carácter de ILIKE (`_`),
 * así «bateria» encuentra «batería»; después se reordena por relevancia con el texto normalizado.
 */
export function searchTerm(raw: string): string | null {
  const clean = raw.replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return clean.length >= 2 ? clean : null;
}

/** Patrón ILIKE tolerante a acentos y mayúsculas: las vocales (con o sin tilde) y la ñ pasan a `_` (un carácter cualquiera). */
export function accentPattern(term: string): string {
  return term.replace(/[aeiouáéíóúàèìòùäëïöüâêîôûñ]/gi, "_");
}

export type StaffProductHit = { id: string; name: string; brand: string | null; ref: string | null; price: number; image: string | null; available: boolean };

/** Relevancia: referencia exacta > nombre que empieza por el término > palabra que empieza > contiene; los no disponibles al final. */
export function rankHits(hits: StaffProductHit[], term: string): StaffProductHit[] {
  const t = normKey(term);
  const score = (h: StaffProductHit) => {
    const name = normKey(h.name);
    const ref = normKey(h.ref ?? "");
    const brand = normKey(h.brand ?? "");
    let s = 0;
    if (ref && ref === t) s += 100;
    if (name.startsWith(t)) s += 50;
    else if (name.split(" ").some((w) => w.startsWith(t))) s += 30;
    else if (name.includes(t)) s += 20;
    if (brand.startsWith(t)) s += 15;
    if (ref.includes(t)) s += 10;
    if (!h.available) s -= 40;
    return s;
  };
  // Filtro exacto (sin acentos): TODAS las palabras del término deben aparecer en nombre, marca o referencia.
  const words = t.split(" ").filter(Boolean);
  return hits
    .filter((h) => {
      const hay = normKey(`${h.name} ${h.brand ?? ""} ${h.ref ?? ""}`);
      return words.every((w) => hay.includes(w));
    })
    .map((h) => ({ h, s: score(h) }))
    .sort((a, b) => b.s - a.s || a.h.name.localeCompare(b.h.name, "es"))
    .map((x) => x.h);
}

/** Palabra que se usa para la consulta a la base (la más larga: la más selectiva). */
export function queryWord(term: string): string {
  return term.split(" ").filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? term;
}
