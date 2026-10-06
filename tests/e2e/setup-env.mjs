// Genera `.env.e2e` (ignorado por git) apuntando a la pila LOCAL de Supabase (`supabase start`).
// Las claves de Cloudinary y Gemini se toman de `.env.local` (pruebas reales de integración); nunca se imprimen.
// Mercado Pago y Resend se dejan fuera a propósito: el pago se prueba por la vía manual y el correo sale por Inbucket.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { readEnvFile } from "./lib/support.mjs";

const parse = (out) => Object.fromEntries(out.split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const status = parse(execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", shell: true }));
const local = readEnvFile(".env.local");

if (!/127\.0\.0\.1|localhost/.test(status.API_URL ?? "")) throw new Error("La pila local de Supabase no está activa (supabase start).");

const env = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  E2E_DB_URL: status.DB_URL,
  E2E_INBUCKET_URL: status.API_URL.replace(/:\d+$/, ":56324"),
  GEMINI_API_KEY: local.GEMINI_API_KEY ?? "",
  GEMINI_MODEL: local.GEMINI_MODEL ?? "",
  CLOUDINARY_CLOUD_NAME: local.CLOUDINARY_CLOUD_NAME ?? "",
  CLOUDINARY_API_KEY: local.CLOUDINARY_API_KEY ?? "",
  CLOUDINARY_API_SECRET: local.CLOUDINARY_API_SECRET ?? "",
  CRON_SECRET: "e2e-cron-secret",
};
writeFileSync(".env.e2e", Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
console.log(".env.e2e generado:", Object.keys(env).filter((k) => env[k]).join(", "));
