/**
 * Importación inicial del catálogo Excelenter desde un CSV.
 *   npx tsx scripts/import-excelenter.mts "<ruta.csv>"            → solo reporte (no toca la base de datos)
 *   npx tsx scripts/import-excelenter.mts "<ruta.csv>" --apply    → importa usando el motor de sincronización (sync_catalog)
 * Usa SUPABASE_SERVICE_ROLE_KEY de .env.local (nunca se imprime) y verifica que el proyecto sea el de TechnoUltra.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { buildCatalog, parseCsv } from "../src/lib/catalog/csv.ts";
import { csvTextProvider } from "../src/lib/catalog/provider.ts";
import { runCatalogSync } from "../src/lib/catalog/sync.ts";

const TECHNOULTRA_PROJECT = "agosikmonvjujxzokdlc";
const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error("Uso: npx tsx scripts/import-excelenter.mts <archivo.csv> [--apply]");
  process.exit(2);
}
const text = readFileSync(file, "utf8");
const { items, report } = buildCatalog(parseCsv(text));

console.log(`Filas de datos: ${report.rows} · vacías ignoradas: ${report.empty_rows} · productos únicos: ${report.items}`);
console.log(`Sin categoría: ${report.without_category} · sin subcategoría: ${report.without_subcategory} · sin precio: ${report.without_price} · sin imagen: ${report.without_image}`);
console.log("\nDuplicados fusionados (misma referencia y mismo nombre):", report.merged_duplicates.length ? "" : "ninguno");
for (const d of report.merged_duplicates) console.log(`  · ${d.ref} (${d.count} filas) → ${d.name}`);
console.log("Referencias repetidas con nombres distintos (productos distintos, id interno con sufijo):", report.disambiguated.length ? "" : "ninguna");
for (const d of report.disambiguated) console.log(`  · ${d.ref}: ${d.names.join("  |  ")}`);
console.log("Incidencias:", report.issues.length ? "" : "ninguna");
for (const i of report.issues) console.log(`  · ${i.type} ${i.ref ?? ""} ${i.detail ?? ""}`);
console.log("\nCategoría | Subcategorías | Productos");
for (const c of report.categories.sort((a, b) => a.category.localeCompare(b.category, "es"))) {
  console.log(`${c.category} | ${c.subcategories.length} | ${c.products}`);
  for (const s of c.subcategories.sort((a, b) => a.name.localeCompare(b.name, "es"))) console.log(`    - ${s.name}: ${s.products}`);
}

if (!flags.includes("--apply")) {
  console.log("\n(Reporte solamente. Usa --apply para importar.)");
  process.exit(0);
}

const env: Record<string, string> = {};
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.trimStart().startsWith("#")) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
if (!url.includes(TECHNOULTRA_PROJECT)) throw new Error("El proyecto de Supabase NO es el de TechnoUltra: importación cancelada.");

const client = createClient(url, key, { auth: { persistSession: false } });
const outcome = await runCatalogSync(client, csvTextProvider(text), "import");
console.log("\nResultado:", JSON.stringify(outcome));
console.log(`Productos preparados: ${items.length}`);
process.exit(outcome.ok ? 0 : 1);
