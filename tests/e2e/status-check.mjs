// Comprueba el código HTTP de una ficha inexistente para un navegador normal y para un buscador (Googlebot).
// Uso: node tests/e2e/status-check.mjs [puerto]   (levanta `next start` local contra la pila local de Supabase)
import { spawn } from "node:child_process";
import { readEnvFile } from "./lib/support.mjs";

const port = process.argv[2] ?? "3101";
const env = { ...process.env, ...readEnvFile(".env.e2e"), MERCADOPAGO_ACCESS_TOKEN: "", RESEND_API_KEY: "", SENTRY_DSN: "", NEXT_PUBLIC_APP_URL: `http://localhost:${port}`, NODE_ENV: "production" };
const proc = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], { env, stdio: "ignore" });
const base = `http://localhost:${port}`;
for (let i = 0; i < 60 && !(await fetch(base).then(() => true).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 1000));
const UAS = {
  "navegador": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
  "Googlebot": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};
for (const path of ["/tienda/producto/no-existe-nunca", "/tienda/categoria/no-existe", "/ruta-que-no-existe"]) {
  for (const [name, ua] of Object.entries(UAS)) {
    const r = await fetch(base + path, { headers: { "user-agent": ua } });
    const t = await r.text();
    console.log(`${path.padEnd(40)} ${name.padEnd(10)} HTTP ${r.status} noindex=${/name="robots" content="noindex/.test(t)}`);
  }
}
proc.kill();
