// Medición local de TTFB del Shop (servidor de producción + Supabase local). Uso: node tests/e2e/perf-shop.mjs [puerto]
// Con CATALOG_CACHE_SECONDS=60 (valor de producción). Cuenta también las lecturas a la base (logs de PostgREST no disponibles → se mide tiempo).
import { spawn } from "node:child_process";
import { readEnvFile } from "./lib/support.mjs";
import { psql } from "./lib/fixtures.mjs";

const port = process.argv[2] ?? "3100";
const env = { ...process.env, ...readEnvFile(".env.e2e"), MERCADOPAGO_ACCESS_TOKEN: "", RESEND_API_KEY: "", SENTRY_DSN: "", CATALOG_CACHE_SECONDS: "60", NEXT_PUBLIC_APP_URL: `http://localhost:${port}`, NODE_ENV: "production" };
const proc = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], { env, stdio: "ignore" });
const base = `http://localhost:${port}`;
for (let i = 0; i < 60 && !(await fetch(base).then(() => true).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 1000));
const slugs = psql("select slug from products where source is not null order by name limit 3").split("\n");
async function ttfb(path) {
  const t0 = performance.now();
  const r = await fetch(base + path);
  const reader = r.body.getReader();
  await reader.read();
  const first = performance.now() - t0;
  let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; }
  return { first, total: performance.now() - t0, status: r.status };
}
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const path of ["/tienda", `/tienda/producto/${slugs[0]}`, `/tienda/producto/${slugs[1]}`, "/tienda/carrito"]) {
  const first = await ttfb(path); // frío (llena la caché)
  const runs = [];
  for (let i = 0; i < 9; i++) runs.push(await ttfb(path));
  console.log(`${path.padEnd(70)} frío ${first.first.toFixed(0)} ms · tibio mediana ${med(runs.map((x) => x.first)).toFixed(0)} ms (primer byte) · ${med(runs.map((x) => x.total)).toFixed(0)} ms (total) · ${first.status}`);
}
proc.kill();
