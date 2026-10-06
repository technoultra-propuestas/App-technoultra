// Arranca la aplicación Next apuntando a la pila local (variables de .env.e2e; no se toca .env.local ni producción).
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { sleep } from "./browser.mjs";
import { assertLocal } from "./fixtures.mjs";
import { e2eEnv, readEnvFile } from "./support.mjs";

export async function startApp({ port = 3000, logFile = "tests/e2e/.app.log", mode = "dev" } = {}) {
  const env = { ...readEnvFile(".env.e2e") };
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
