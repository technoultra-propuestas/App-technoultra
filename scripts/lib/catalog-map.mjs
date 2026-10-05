// Validación y mapeo PURO del Excel de catálogo → filas de base de datos. Sin red ni lectura de archivos.
// Principio: NO se inventa ni se corrige en silencio ningún dato comercial. Lo dudoso se reporta como "issue" y se conserva el original.

export const CATALOG_HEADERS = [
  "Orden app", "Categoría", "Subcategoría", "Servicio", "Descripción / qué incluye", "Precio final sugerido (COP)", "Tipo de precio",
  "Incluye en el valor", "No incluye / adicionales", "Tratamiento del valor total", "Tiempo estimado", "Modalidad", "Requiere diagnóstico", "Fuente",
];

/** Tipo de precio del Excel → modo/unidad de la app. El texto original se conserva en `price_type_label`. */
export const PRICE_TYPES = {
  Fijo: { mode: "fixed", unit: null },
  Desde: { mode: "from", unit: null },
  "Mano de obra": { mode: "fixed", unit: null, partsExtra: true },
  "Por programa": { mode: "fixed", unit: " por programa" },
  "Por punto": { mode: "fixed", unit: " por punto" },
  "Por unidad": { mode: "fixed", unit: " por unidad" },
  "Por PC": { mode: "fixed", unit: " por PC" },
  Jornada: { mode: "fixed", unit: " por jornada" },
  "Por incidente": { mode: "fixed", unit: " por incidente" },
  Mensual: { mode: "fixed", unit: "/mes" },
  Gratis: { mode: "fixed", unit: null },
};

/** Modalidad del Excel → modalidades de la app. "Recogida a domicilio" NO existe en el Excel y por tanto no se asigna. */
export const MODALITY_TOKENS = { Presencial: "store", Taller: "store", Laboratorio: "store", Domicilio: "home", Empresa: "home", Remoto: "remote", Chat: "remote" };

/** Categorías cuyo servicio no gira en torno a UN equipo del cliente (decisión operativa, editable en el CRM). */
const NO_EQUIPMENT_CATEGORIES = new Set(["Asesoría Tecnológica", "Empresas"]);

export const slugify = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

const clean = (v) => (v === undefined || v === null ? "" : String(v).replace(/\s+/g, " ").trim());

export function parseModalities(label) {
  const tokens = clean(label).split("/").map((t) => t.trim()).filter(Boolean);
  const unknown = tokens.filter((t) => !(t in MODALITY_TOKENS));
  return { modalities: [...new Set(tokens.filter((t) => t in MODALITY_TOKENS).map((t) => MODALITY_TOKENS[t]))], unknown };
}

/**
 * @param {{Catalogo:any[][], Categorias_App:any[][], Reglas_Precios:any[][], Fuentes:any[][]}} sheets
 * @returns {{ categories, subcategories, services, sources, rules, issues: {level:'error'|'warn', row?:number, message:string}[], stats }}
 */
export function parseCatalog(sheets) {
  const issues = [];
  const err = (message, row) => issues.push({ level: "error", row, message });
  const warn = (message, row) => issues.push({ level: "warn", row, message });

  // ---- cabeceras
  const headerRow = (sheets.Catalogo ?? [])[2] ?? [];
  CATALOG_HEADERS.forEach((h, i) => {
    if (clean(headerRow[i]) !== h) err(`Columna ${i + 1} esperada "${h}" y se encontró "${clean(headerRow[i])}".`);
  });
  if (issues.some((i) => i.level === "error")) return { categories: [], subcategories: [], services: [], sources: [], rules: [], issues, stats: {} };

  // ---- categorías (hoja Categorias_App)
  const catRows = (sheets.Categorias_App ?? []).slice(2).filter((r) => typeof r[0] === "number" && clean(r[1]));
  const categories = catRows.map((r) => ({
    sort_order: Number(r[0]),
    name: clean(r[1]),
    slug: slugify(r[1]),
    description: clean(r[2]) || null,
    app_location: clean(r[3]) || null,
    commercial_priority: clean(r[4]) || null,
  }));
  const catNames = new Set(categories.map((c) => c.name));
  if (catNames.size !== categories.length) err("Hay categorías repetidas en Categorias_App.");

  // ---- fuentes y reglas
  const sources = (sheets.Fuentes ?? []).slice(1).filter((r) => clean(r[0]) && clean(r[1])).map((r) => ({ name: clean(r[0]), url: clean(r[1]), usage: clean(r[2]) || null }));
  const sourceByUrl = new Map(sources.map((s) => [s.url, s.name]));
  const rules = (sheets.Reglas_Precios ?? []).slice(1).filter((r) => clean(r[0]) && clean(r[1])).map((r, i) => ({ position: i + 1, rule: clean(r[0]), recommendation: clean(r[1]) }));

  // ---- servicios
  const rows = (sheets.Catalogo ?? []).slice(3).map((r, i) => ({ r, sheetRow: i + 4 })).filter(({ r }) => r.some((c) => clean(c)));
  const services = [];
  const subKey = new Map();
  const subcategories = [];
  const tuples = new Set();
  const slugs = new Set();

  rows.forEach(({ r, sheetRow }, idx) => {
    const raw = Object.fromEntries(CATALOG_HEADERS.map((h, i) => [h, r[i] ?? null]));
    const name = clean(r[3]);
    const category = clean(r[1]);
    const subcategory = clean(r[2]);
    if (!name) return err("Servicio sin nombre.", sheetRow);
    if (!category || !catNames.has(category)) return err(`Categoría inexistente en Categorias_App: "${category}".`, sheetRow);
    if (!subcategory) return err("Subcategoría vacía.", sheetRow);
    const tuple = `${category}|${subcategory}|${name}`.toLowerCase();
    if (tuples.has(tuple)) return err(`Duplicado exacto (categoría/subcategoría/servicio): ${name}.`, sheetRow);
    tuples.add(tuple);

    const price = r[5];
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || !Number.isInteger(price)) return err(`Precio inválido: "${price}".`, sheetRow);
    const typeLabel = clean(r[6]);
    const type = PRICE_TYPES[typeLabel];
    if (!type) return err(`Tipo de precio desconocido: "${typeLabel}". No se asume ningún valor.`, sheetRow);
    if (price === 0 && typeLabel !== "Gratis") warn(`Precio 0 con tipo "${typeLabel}".`, sheetRow);
    if (typeLabel === "Gratis" && price !== 0) warn(`Tipo "Gratis" con precio ${price}.`, sheetRow);

    const mod = parseModalities(r[11]);
    if (mod.unknown.length || mod.modalities.length === 0) return err(`Modalidad no reconocida: "${clean(r[11])}" (${mod.unknown.join(", ")}).`, sheetRow);
    const diag = clean(r[12]);
    if (!["Sí", "No"].includes(diag)) return err(`"Requiere diagnóstico" debe ser Sí/No y es "${diag}".`, sheetRow);

    const treatment = clean(r[9]);
    const partsExtra = Boolean(type.partsExtra) || /\+\s*repuesto/i.test(treatment);
    const requiresDiagnosis = diag === "Sí";
    const shortDescription = clean(r[4]);
    if (shortDescription.length > 200) warn("Descripción mayor a 200 caracteres: se conserva completa en description.", sheetRow);

    let slug = slugify(name);
    if (slugs.has(slug)) slug = slugify(`${name}-${subcategory}`);
    if (slugs.has(slug)) slug = slugify(`${name}-${subcategory}-${category}`);
    if (slugs.has(slug)) return err(`No se pudo generar un slug único para "${name}".`, sheetRow);
    slugs.add(slug);

    const sk = `${category}|${subcategory}`;
    if (!subKey.has(sk)) {
      subKey.set(sk, subcategories.length);
      subcategories.push({ category, name: subcategory, slug: slugify(subcategory), sort_order: subcategories.length + 1 });
    }
    const source_url = clean(r[13]) || null;
    services.push({
      import_key: `tarifario-2026:${String(idx + 1).padStart(4, "0")}`,
      sheet_row: sheetRow,
      category,
      subcategory,
      slug,
      name,
      kind: "technical",
      short_description: shortDescription.length <= 200 ? shortDescription || null : null,
      description: shortDescription.length > 200 ? shortDescription : null,
      price_mode: type.mode,
      base_price: price,
      price_unit: type.unit,
      price_type_label: typeLabel,
      parts_extra: partsExtra,
      includes_text: clean(r[7]) || null,
      excludes_text: clean(r[8]) || null,
      price_treatment: treatment || null,
      estimated_time: clean(r[10]) || null,
      modality_label: clean(r[11]) || null,
      allowed_modalities: mod.modalities,
      requires_diagnosis: requiresDiagnosis,
      // Derivados de las reglas de precios (Reglas_Precios): "Desde", diagnóstico o "+ repuesto" exigen cotización antes de confirmar.
      requires_quote: type.mode === "from" || requiresDiagnosis || partsExtra,
      requires_equipment: !NO_EQUIPMENT_CATEGORIES.has(category),
      default_warranty_days: 0, // el Excel no define garantías: no se inventan
      catalog_order: typeof r[0] === "number" ? r[0] : null,
      sort_order: (idx + 1) * 10,
      is_active: true,
      source_name: source_url ? (sourceByUrl.get(source_url) ?? null) : null,
      source_url,
      raw,
    });
    if (source_url && !sourceByUrl.has(source_url)) warn(`Fuente no listada en la hoja Fuentes: ${source_url}`, sheetRow);
  });

  // ---- coherencia con el resumen del propio archivo
  const summary = Object.fromEntries((sheets.Categorias_App ?? []).slice(2).filter((r) => clean(r[6])).map((r) => [clean(r[6]), r[7]]));
  const diagCount = services.filter((s) => s.requires_diagnosis).length;
  if (summary["Servicios totales"] !== undefined && summary["Servicios totales"] !== services.length) warn(`El resumen indica ${summary["Servicios totales"]} servicios y se leyeron ${services.length}.`);
  if (summary["Categorías"] !== undefined && summary["Categorías"] !== categories.length) warn(`El resumen indica ${summary["Categorías"]} categorías y se leyeron ${categories.length}.`);
  if (summary["Servicios con diagnóstico"] !== undefined && summary["Servicios con diagnóstico"] !== diagCount) warn(`El resumen indica ${summary["Servicios con diagnóstico"]} con diagnóstico y se leyeron ${diagCount}.`);
  const usedCats = new Set(services.map((s) => s.category));
  for (const c of categories) if (!usedCats.has(c.name)) warn(`Categoría sin servicios: ${c.name}.`);

  return {
    categories,
    subcategories,
    services,
    sources,
    rules,
    issues,
    stats: { services: services.length, categories: categories.length, subcategories: subcategories.length, withDiagnosis: diagCount, from: services.filter((s) => s.price_mode === "from").length, partsExtra: services.filter((s) => s.parts_extra).length },
  };
}
