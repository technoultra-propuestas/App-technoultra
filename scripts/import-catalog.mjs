// CARGA INICIAL del catálogo oficial (Excel → Supabase). El Excel NO se usa en runtime: la app lee siempre de Supabase.
//
//   Validar (no escribe nada):   node scripts/import-catalog.mjs [ruta.xlsx]
//   Aplicar:                     node --env-file=.env.local scripts/import-catalog.mjs [ruta.xlsx] --apply
//
// Idempotente: cada servicio lleva una clave estable (service_import_meta.import_key). Si ya existe, NO se toca (así no se
// pisan los cambios hechos luego desde el CRM). Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY solo con --apply.
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { parseCatalog } from "./lib/catalog-map.mjs";
import { readWorkbook } from "./lib/read-xlsx.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const file = args.find((a) => a.endsWith(".xlsx")) ?? "data/import/catalogo_servicios_mantenimiento_computadores_cali.xlsx";
if (!existsSync(file)) {
  console.error(`No existe el archivo: ${file}`);
  process.exit(1);
}

const sheets = await readWorkbook(file);
const cat = parseCatalog(sheets);
const errors = cat.issues.filter((i) => i.level === "error");
const warns = cat.issues.filter((i) => i.level === "warn");
console.log(`Archivo: ${file}`);
console.log(`Servicios: ${cat.stats.services} · Categorías: ${cat.stats.categories} · Subcategorías: ${cat.stats.subcategories} · Con diagnóstico: ${cat.stats.withDiagnosis} · "Desde": ${cat.stats.from} · "+ repuesto": ${cat.stats.partsExtra}`);
for (const w of warns) console.log(`  AVISO${w.row ? ` (fila ${w.row})` : ""}: ${w.message}`);
for (const e of errors) console.log(`  ERROR${e.row ? ` (fila ${e.row})` : ""}: ${e.message}`);
if (errors.length) {
  console.error(`\nSe encontraron ${errors.length} error(es). No se importó nada (no se corrige ningún dato en silencio).`);
  process.exit(1);
}
if (!apply) {
  console.log("\nValidación correcta. Usa --apply para cargar en Supabase.");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (usa: node --env-file=.env.local ...).");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const fail = (what, error) => {
  console.error(`Error en ${what}: ${error.code ?? ""} ${error.message}`);
  process.exit(1);
};

// 1) categorías (por slug; no se pisan las ya existentes)
const { data: existingCats, error: e1 } = await sb.from("service_categories").select("id, slug");
if (e1) fail("leer categorías", e1);
const catId = new Map((existingCats ?? []).map((c) => [c.slug, c.id]));
const newCats = cat.categories.filter((c) => !catId.has(c.slug)).map((c) => ({ ...c, kind: "technical", is_active: true }));
if (newCats.length) {
  const { data, error } = await sb.from("service_categories").insert(newCats).select("id, slug");
  if (error) fail("insertar categorías", error);
  data.forEach((c) => catId.set(c.slug, c.id));
}
const catByName = new Map(cat.categories.map((c) => [c.name, catId.get(c.slug)]));

// 2) subcategorías (categoría + slug)
const { data: existingSubs, error: e2 } = await sb.from("service_subcategories").select("id, category_id, slug");
if (e2) fail("leer subcategorías", e2);
const subId = new Map((existingSubs ?? []).map((s) => [`${s.category_id}|${s.slug}`, s.id]));
const newSubs = cat.subcategories
  .map((s) => ({ category_id: catByName.get(s.category), slug: s.slug, name: s.name, sort_order: s.sort_order, is_active: true }))
  .filter((s) => !subId.has(`${s.category_id}|${s.slug}`));
if (newSubs.length) {
  const { data, error } = await sb.from("service_subcategories").insert(newSubs).select("id, category_id, slug");
  if (error) fail("insertar subcategorías", error);
  data.forEach((s) => subId.set(`${s.category_id}|${s.slug}`, s.id));
}

// 3) servicios nuevos (por import_key)
const { data: metas, error: e3 } = await sb.from("service_import_meta").select("import_key");
if (e3) fail("leer trazabilidad", e3);
const done = new Set((metas ?? []).map((m) => m.import_key));
const { data: usedSlugs, error: e4 } = await sb.from("services").select("slug");
if (e4) fail("leer slugs", e4);
const taken = new Set((usedSlugs ?? []).map((s) => s.slug));
let created = 0;
let skipped = 0;
for (const s of cat.services) {
  if (done.has(s.import_key)) {
    skipped++;
    continue;
  }
  let slug = s.slug;
  if (taken.has(slug)) slug = `${slug}-${s.import_key.slice(-4)}`; // colisión con un servicio creado antes desde el CRM
  taken.add(slug);
  const category_id = catByName.get(s.category);
  const subcategory_id = subId.get(`${category_id}|${cat.subcategories.find((x) => x.category === s.category && x.name === s.subcategory).slug}`);
  const { data: row, error } = await sb
    .from("services")
    .insert({
      category_id, subcategory_id, slug, name: s.name, kind: s.kind, short_description: s.short_description, description: s.description,
      price_mode: s.price_mode, base_price: s.base_price, price_unit: s.price_unit, price_type_label: s.price_type_label, parts_extra: s.parts_extra,
      includes_text: s.includes_text, excludes_text: s.excludes_text, price_treatment: s.price_treatment, estimated_time: s.estimated_time,
      modality_label: s.modality_label, allowed_modalities: s.allowed_modalities, requires_diagnosis: s.requires_diagnosis, requires_quote: s.requires_quote,
      requires_equipment: s.requires_equipment, default_warranty_days: s.default_warranty_days, catalog_order: s.catalog_order, sort_order: s.sort_order, is_active: s.is_active,
    })
    .select("id")
    .single();
  if (error) fail(`servicio fila ${s.sheet_row} (${s.name})`, error);
  const { error: em } = await sb.from("service_import_meta").insert({ service_id: row.id, import_key: s.import_key, source_name: s.source_name, source_url: s.source_url, raw: s.raw });
  if (em) fail(`trazabilidad fila ${s.sheet_row}`, em);
  created++;
}

// 4) fuentes y reglas de precios (referencia interna, solo administración)
if (cat.sources.length) {
  const { error } = await sb.from("catalog_sources").upsert(cat.sources, { onConflict: "url", ignoreDuplicates: true });
  if (error) fail("fuentes", error);
}
if (cat.rules.length) {
  const { error } = await sb.from("catalog_pricing_rules").upsert(cat.rules, { onConflict: "rule", ignoreDuplicates: true });
  if (error) fail("reglas de precios", error);
}
console.log(`\nImportación aplicada: ${created} servicio(s) creados, ${skipped} ya existían (no se modificaron). Categorías nuevas: ${newCats.length}. Subcategorías nuevas: ${newSubs.length}.`);
