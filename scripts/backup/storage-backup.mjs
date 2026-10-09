// Copia de todos los archivos de Supabase Storage (p. ej. el bucket `documents` con los PDF) a una carpeta local.
// Uso: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup/storage-backup.mjs <carpeta>
// Solo usa fetch (sin dependencias). La clave de servicio NUNCA se imprime. Falla si algún archivo no se puede descargar.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const out = path.resolve(process.argv[2] ?? "backup", "storage");
if (!base || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function api(pathname, init) {
  const r = await fetch(`${base}/storage/v1/${pathname}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`Storage ${pathname.split("?")[0]} respondió ${r.status}`);
  return r;
}

/** Lista recursivamente todos los objetos de un bucket (las carpetas aparecen como entradas sin `id`). */
async function listAll(bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const r = await api(`object/list/${bucket}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
    });
    const page = await r.json();
    for (const e of page) {
      const full = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id) files.push({ path: full, size: e.metadata?.size ?? null });
      else files.push(...(await listAll(bucket, full)));
    }
    if (page.length < 100) break;
  }
  return files;
}

const buckets = await (await api("bucket")).json();
const manifest = { generated_at: new Date().toISOString(), buckets: [] };
let total = 0;
for (const b of buckets) {
  const files = await listAll(b.name);
  const entries = [];
  for (const f of files) {
    const r = await api(`object/${b.name}/${f.path.split("/").map(encodeURIComponent).join("/")}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const dest = path.join(out, b.name, ...f.path.split("/"));
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    entries.push({ path: f.path, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") });
    total++;
  }
  manifest.buckets.push({ name: b.name, public: b.public, files: entries.length, items: entries });
  console.log(`bucket ${b.name}: ${entries.length} archivo(s)`);
}
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`storage: ${total} archivo(s) en ${buckets.length} bucket(s)`);
