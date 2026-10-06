// CARGA INICIAL de los textos legales (Legales/*.docx → legal_documents como BORRADORES). Los Word NO se usan en runtime.
//
//   Validar (no escribe):   node scripts/import-legal.mjs
//   Aplicar:                node --env-file=.env.local scripts/import-legal.mjs --apply
//
// No publica nada: los documentos se crean como borrador v1 y el SUPERADMIN los revisa y publica desde CRM → Centro legal. Mientras
// existan campos «[PENDIENTE: …]» la base de datos impide publicarlos. Idempotente: si ya existe una versión de ese documento, lo omite.
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { readDocx } from "./lib/read-docx.mjs";
import { docToText, LEGAL_FILES, pendingMarkers } from "./lib/legal-map.mjs";

const apply = process.argv.includes("--apply");
// --refresh: vuelve a escribir el contenido de los BORRADORES existentes desde el Word (pisa ediciones hechas en el CRM; no toca publicados).
const refresh = process.argv.includes("--refresh");
const dir = "Legales";
// Datos entregados por el propietario (si el CRM ya tiene valores públicos distintos, se usan esos al aplicar).
let biz = { name: "TechnoUltra", phone: "3183943465", address: "Cra 1A 59-60" };

const sb = apply && process.env.SUPABASE_SERVICE_ROLE_KEY ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
if (apply && !sb) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (usa: node --env-file=.env.local ...).");
  process.exit(1);
}
if (sb) {
  const { data } = await sb.from("app_settings").select("key, value").in("key", ["business.name", "business.phone", "business.address"]);
  const m = Object.fromEntries((data ?? []).map((r) => [r.key, typeof r.value === "string" ? r.value : ""]));
  biz = { name: m["business.name"] || biz.name, phone: m["business.phone"] || biz.phone, address: m["business.address"] || biz.address };
}

let created = 0;
let skipped = 0;
for (const f of LEGAL_FILES) {
  const path = `${dir}/${f.file}`;
  if (!existsSync(path)) {
    console.error(`No existe: ${path}`);
    process.exit(1);
  }
  const text = docToText(await readDocx(path), biz);
  const pending = pendingMarkers(text);
  console.log(`${f.slug.padEnd(18)} ${String(text.length).padStart(6)} caracteres · pendientes: ${pending.length ? pending.join(", ") : "ninguno"}`);
  if (!apply) continue;
  const { data: exists } = await sb.from("legal_documents").select("id, status").eq("slug", f.slug).order("version", { ascending: false }).limit(1);
  if (exists?.length) {
    if (refresh && exists[0].status === "draft") {
      const { error } = await sb.from("legal_documents").update({ content: text, title: f.title, requires_acceptance: f.requires }).eq("id", exists[0].id).eq("status", "draft");
      if (error) {
        console.error(`Error al refrescar ${f.slug}: ${error.code} ${error.message}`);
        process.exit(1);
      }
      created++;
    } else skipped++;
    continue;
  }
  const { error } = await sb.from("legal_documents").insert({ slug: f.slug, version: 1, title: f.title, content: text, requires_acceptance: f.requires, status: "draft" });
  if (error) {
    console.error(`Error en ${f.slug}: ${error.code} ${error.message}`);
    process.exit(1);
  }
  created++;
}
console.log(apply ? `\nAplicado: ${created} borrador(es) creados, ${skipped} ya existían.` : "\nValidación correcta. Usa --apply para cargar los borradores.");
