// Arranca la aplicación Next apuntando a la pila local (variables de .env.e2e; no se toca .env.local ni producción).
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { sleep } from "./browser.mjs";
import { assertLocal } from "./fixtures.mjs";
import { e2eEnv, readEnvFile } from "./support.mjs";

export async function startApp({ port = 3000, logFile = "tests/e2e/.app.log", mode = "dev", mpMockBase = null } = {}) {
  // Next también carga `.env.local`: se fijan en blanco las integraciones externas para que las pruebas NUNCA usen credenciales
  // reales (Mercado Pago, correo, Sentry). Un valor definido, aunque vacío, tiene prioridad sobre `.env.local`.
  const env = { MERCADOPAGO_ACCESS_TOKEN: "", MERCADOPAGO_WEBHOOK_SECRET: "", NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "", RESEND_API_KEY: "", SENTRY_DSN: "", CATALOG_CACHE_SECONDS: "1", ...readEnvFile(".env.e2e") };
  // Modo «--mp-mock»: la API de Mercado Pago es un servidor local simulado (tests/e2e/lib/mp-mock.mjs); jamás se usan credenciales reales.
  if (mpMockBase) Object.assign(env, { MERCADOPAGO_ACCESS_TOKEN: "TEST-1111111111111111-000000-e2e-token-0000000000", MERCADOPAGO_WEBHOOK_SECRET: "e2e-webhook-secret-0123456789", MERCADOPAGO_API_BASE: mpMockBase });
  assertLocal(env);
  const base = `http://localhost:${port}`;
  // Si ya hay un servidor en ese puerto (p. ej. lo arrancó el desarrollador), se reutiliza.
  if (await fetch(base, { redirect: "manual" }).then(() => true).catch(() => false)) return { base, stop: () => {} };
  if (mode === "start") {
    // Compilación de producción (sin arranques en frío de desarrollo): las variables NEXT_PUBLIC_* se fijan aquí.
    const b = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env: { ...process.env, ...env, NEXT_PUBLIC_APP_URL: base }, stdio: ["ignore", "ignore", "inherit"] });
    if (b.status !== 0) throw new Error("next build falló");
  }
  const log = createWriteStream(logFile);
  const proc = spawn(process.execPath, ["node_modules/next/dist/bin/next", mode === "start" ? "start" : "dev", "-p", String(port)], {
    env: { ...process.env, ...env, NEXT_PUBLIC_APP_URL: base, NODE_ENV: mode === "start" ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.pipe(log);
  proc.stderr.pipe(log);
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    if (await fetch(base, { redirect: "manual" }).then(() => true).catch(() => false)) return { base, stop: () => proc.kill() };
  }
  proc.kill();
  throw new Error(`La aplicación no arrancó (ver ${logFile}).`);
}

export { e2eEnv };
