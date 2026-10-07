import { normKey, normRef, normText, shortHash } from "./normalize";

/** Producto tal como lo entrega cualquier fuente (CSV, API, feed). El motor de sincronización solo conoce esta forma. */
export type SourceProduct = {
  source_product_id: string;
  source_ref: string;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  price: number | null;
  stock: number | null;
  description: string | null;
  image_url: string | null;
};

/** Lector CSV (RFC 4180): comillas, comas y saltos de línea dentro de campos. Sin dependencias. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export type CatalogIssue = { type: string; ref: string | null; detail?: string };
export type CatalogReport = {
  rows: number;
  empty_rows: number;
  items: number;
  merged_duplicates: { ref: string; name: string; count: number }[];
  disambiguated: { ref: string; names: string[] }[];
  issues: CatalogIssue[];
  categories: { category: string; subcategories: { name: string; products: number }[]; products: number }[];
  without_category: number;
  without_subcategory: number;
  without_price: number;
  without_image: number;
};

const REQUIRED = ["referencia", "nombre", "marca", "categoria", "subcategoria", "precio", "cantidad", "descripcion", "imagen_url", "activo"];

/**
 * Convierte las filas del CSV en productos de fuente y un reporte de calidad (categorías, duplicados, faltantes).
 * · Filas completamente vacías se ignoran (se cuentan).
 * · Misma referencia y mismo nombre → un solo producto (se conserva la fila con imagen).
 * · Misma referencia con nombres DISTINTOS → son productos distintos: cada uno recibe un identificador interno `REF~hash` (la referencia visible no cambia).
 * · `activo` en FALSO → disponibilidad 0.
 * No se inventa ningún dato: lo que falta queda nulo y se reporta.
 */
export function buildCatalog(rows: string[][]): { items: SourceProduct[]; report: CatalogReport } {
  const header = (rows[0] ?? []).map((h) => normKey(h));
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`Columnas faltantes en el catálogo: ${missing.join(", ")}`);
  const col = (r: string[], name: string) => normText(r[header.indexOf(name)]);
  const raw = (r: string[], name: string) => (r[header.indexOf(name)] ?? "").trim();

  type Row = Omit<SourceProduct, "source_product_id"> & { key: string };
  const parsed: Row[] = [];
  const issues: CatalogIssue[] = [];
  let empty = 0;
  for (const r of rows.slice(1)) {
    const ref = col(r, "referencia");
    const name = col(r, "nombre");
    if (!ref && !name && !col(r, "precio") && !col(r, "categoria")) {
      empty++;
      continue;
    }
    if (!ref) {
      issues.push({ type: "missing_reference", ref: null, detail: name });
      continue;
    }
    const priceText = col(r, "precio").replace(/[^0-9.]/g, "");
    const price = priceText ? Number(priceText) : null;
    const stockText = col(r, "cantidad").replace(/[^0-9]/g, "");
    const active = !/^(false|falso|no|0)$/i.test(col(r, "activo"));
    const stock = stockText ? (active ? Number(stockText) : 0) : active ? null : 0;
    if (price === null || !(price > 0)) issues.push({ type: "invalid_price", ref });
    if (stock === null) issues.push({ type: "missing_stock", ref });
    parsed.push({
      key: normRef(ref),
      source_ref: ref,
      name,
      brand: col(r, "marca") || null,
      category: col(r, "categoria") || null,
      subcategory: col(r, "subcategoria") || null,
      price: price !== null && price > 0 ? price : null,
      stock,
      description: raw(r, "descripcion") || null,
      image_url: raw(r, "imagen_url") || null,
    });
  }

  // Agrupa por referencia; dentro de cada grupo por nombre normalizado.
  const byKey = new Map<string, Row[]>();
  for (const p of parsed) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p]);
  const items: SourceProduct[] = [];
  const merged: CatalogReport["merged_duplicates"] = [];
  const disamb: CatalogReport["disambiguated"] = [];
  for (const [key, group] of byKey) {
    const byName = new Map<string, Row[]>();
    for (const g of group) byName.set(normKey(g.name), [...(byName.get(normKey(g.name)) ?? []), g]);
    const variants = [...byName.values()];
    if (variants.length > 1) disamb.push({ ref: key, names: variants.map((v) => v[0].name) });
    for (const same of variants) {
      const best = same.find((s) => s.image_url) ?? same[0];
      if (same.length > 1) merged.push({ ref: key, name: best.name, count: same.length });
      const { key: _k, ...rest } = best;
      items.push({ ...rest, source_product_id: variants.length > 1 ? `${key}~${shortHash(normKey(best.name)).toUpperCase()}` : key });
    }
  }

  // Reporte de categorías → subcategorías → productos (identidad por nombre normalizado, nombre visible del primer registro).
  const cats = new Map<string, { name: string; subs: Map<string, { name: string; n: number }>; n: number }>();
  for (const it of items) {
    if (!it.category) continue;
    const ck = normKey(it.category);
    const c = cats.get(ck) ?? { name: it.category, subs: new Map(), n: 0 };
    c.n++;
    if (it.subcategory) {
      const sk = normKey(it.subcategory);
      const s = c.subs.get(sk) ?? { name: it.subcategory, n: 0 };
      s.n++;
      c.subs.set(sk, s);
    }
    cats.set(ck, c);
  }
  const report: CatalogReport = {
    rows: rows.length - 1,
    empty_rows: empty,
    items: items.length,
    merged_duplicates: merged,
    disambiguated: disamb,
    issues,
    categories: [...cats.values()].map((c) => ({ category: c.name, products: c.n, subcategories: [...c.subs.values()].map((s) => ({ name: s.name, products: s.n })) })),
    without_category: items.filter((i) => !i.category).length,
    without_subcategory: items.filter((i) => i.category && !i.subcategory).length,
    without_price: items.filter((i) => i.price === null).length,
    without_image: items.filter((i) => !i.image_url).length,
  };
  return { items, report };
}
