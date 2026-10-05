import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error módulo .mjs sin tipos (script de carga inicial)
import { parseCatalog, parseModalities } from "../../scripts/lib/catalog-map.mjs";
// @ts-expect-error módulo .mjs sin tipos
import { readWorkbook } from "../../scripts/lib/read-xlsx.mjs";

const FILE = "data/import/catalogo_servicios_mantenimiento_computadores_cali.xlsx";

const HEAD = ["Orden app", "Categoría", "Subcategoría", "Servicio", "Descripción / qué incluye", "Precio final sugerido (COP)", "Tipo de precio", "Incluye en el valor", "No incluye / adicionales", "Tratamiento del valor total", "Tiempo estimado", "Modalidad", "Requiere diagnóstico", "Fuente"];
const sheets = (rows: unknown[][]) => ({
  Catalogo: [[], [], HEAD, ...rows],
  Categorias_App: [[], [], [1, "Cat", "desc", "Inicio", "Alta"]],
  Reglas_Precios: [["Regla", "Recomendación"]],
  Fuentes: [["Fuente", "URL", "Uso"]],
});
const row = (o: Partial<Record<number, unknown>> = {}) => {
  const r: unknown[] = [1, "Cat", "Sub", "Servicio A", "Desc", 50000, "Fijo", "inc", "exc", "Valor final", "1 h", "Presencial / Domicilio", "No", ""];
  for (const [i, v] of Object.entries(o)) r[Number(i)] = v;
  return r;
};

describe("importación de catálogo: reglas de validación", () => {
  it("mapea una fila válida sin inventar datos", () => {
    const c = parseCatalog(sheets([row()]));
    expect(c.issues.filter((i: { level: string }) => i.level === "error")).toEqual([]);
    expect(c.services[0]).toMatchObject({ price_mode: "fixed", base_price: 50000, allowed_modalities: ["store", "home"], requires_diagnosis: false, default_warranty_days: 0 });
  });
  it("'Desde' y 'Mano de obra' conservan su semántica", () => {
    const c = parseCatalog(sheets([row({ 3: "A", 6: "Desde" }), row({ 3: "B", 6: "Mano de obra" })]));
    expect(c.services[0]).toMatchObject({ price_mode: "from", requires_quote: true });
    expect(c.services[1]).toMatchObject({ parts_extra: true });
  });
  it("rechaza (sin corregir) duplicados, precios, categorías y modalidades inválidos", () => {
    const bad = (r: unknown[]) => parseCatalog(sheets([r])).issues.some((i: { level: string }) => i.level === "error");
    expect(parseCatalog(sheets([row(), row()])).issues.some((i: { level: string }) => i.level === "error")).toBe(true);
    expect(bad(row({ 5: "abc" }))).toBe(true);
    expect(bad(row({ 5: -1 }))).toBe(true);
    expect(bad(row({ 1: "Inexistente" }))).toBe(true);
    expect(bad(row({ 11: "Teletransporte" }))).toBe(true);
    expect(bad(row({ 6: "Cosa rara" }))).toBe(true);
    expect(bad(row({ 3: "" }))).toBe(true);
    expect(bad(row({ 12: "Quizá" }))).toBe(true);
  });
  it("no asigna recogida a domicilio", () => {
    expect(parseModalities("Presencial / Domicilio / Remoto").modalities).not.toContain("pickup");
  });
});

describe.skipIf(!existsSync(FILE))("importación de catálogo: Excel oficial", () => {
  it("161 servicios, 13 categorías y 41 con diagnóstico, sin errores", async () => {
    const c = parseCatalog(await readWorkbook(FILE));
    expect(c.issues.filter((i: { level: string }) => i.level === "error")).toEqual([]);
    expect(c.stats).toMatchObject({ services: 161, categories: 13, withDiagnosis: 41 });
    expect(new Set(c.services.map((s: { slug: string }) => s.slug)).size).toBe(161);
    expect(new Set(c.services.map((s: { import_key: string }) => s.import_key)).size).toBe(161);
  });
});
