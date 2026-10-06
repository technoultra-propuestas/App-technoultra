// Orquestador E2E. Uso:  node tests/e2e/run.mjs [escenario ...] [--reset] [--dev]
// Requisitos: Docker + `npx supabase start` (pila local) y Chrome. Todo corre contra la base LOCAL: los tickets, pagos y
// auditoría son inmutables por diseño, así que estas pruebas jamás se ejecutan contra producción.
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { startApp } from "./lib/app.mjs";
import { Browser } from "./lib/browser.mjs";
import { adminClient, assertLocal, psql, publishLegalFixtures, seedStaff } from "./lib/fixtures.mjs";
import { deleteTestAssets } from "./lib/cloudinary.mjs";
import { createReporter, inbucket, randomPassword, readEnvFile, stamp } from "./lib/support.mjs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const wanted = args.filter((a) => !a.startsWith("--"));
const STATE = "tests/e2e/.state.json";
const OUT = "tests/e2e/.out";
mkdirSync(OUT, { recursive: true });

if (!existsSync(".env.e2e")) execFileSync(process.execPath, ["tests/e2e/setup-env.mjs"], { stdio: "inherit" });
const env = readEnvFile(".env.e2e");
assertLocal(env);

if (flags.has("--reset")) {
  console.log("Reiniciando la base local (supabase db reset) e importando el catálogo…");
  execFileSync("npx", ["supabase", "db", "reset", "--local", "--yes"], { stdio: "inherit", shell: true });
  execFileSync(process.execPath, ["--env-file=.env.e2e", "scripts/import-catalog.mjs", "--apply"], { stdio: "inherit" });
  if (existsSync(STATE)) writeFileSync(STATE, "{}");
  // Tras el reset, Auth/PostgREST tardan unos segundos en volver: se espera a que respondan antes de sembrar.
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY } }).then((r) => r.ok).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  await new Promise((r) => setTimeout(r, 5000));
}

const sb = adminClient(env);
let state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
if (!state.owner || psql("select count(*) from public.profiles where role = 'superadmin'") === "0") {
  const s = stamp();
  state = {
    owner: { email: `owner-${s}@e2e.technoultra.test`, password: randomPassword(), fullName: "Propietario E2E" },
    tech: { email: `tecnico-${s}@e2e.technoultra.test`, password: randomPassword(), fullName: "Técnico E2E" },
  };
  const ids = await seedStaff(sb, state);
  state.ownerId = ids.ownerId;
  state.techId = ids.techId;
  publishLegalFixtures(ids.ownerId);
  writeFileSync(STATE, JSON.stringify(state));
}
const save = () => writeFileSync(STATE, JSON.stringify(state));

const app = await startApp({ mode: flags.has("--dev") ? "dev" : "start" });
const mail = inbucket(env.E2E_INBUCKET_URL ?? "http://127.0.0.1:56324");
const browser = await Browser.launch({ baseUrl: app.base, profileDir: join(tmpdir(), `tu-e2e-chrome-${stamp()}`) });

const files = readdirSync("tests/e2e/scenarios").filter((f) => f.endsWith(".mjs")).sort();
const selected = files.filter((f) => !wanted.length || wanted.some((w) => f.includes(w)));
let allOk = true;
try {
  for (const f of selected) {
    // Los límites de intentos (seguridad real de la app) se vacían entre escenarios: aquí no se prueban y varios inicios de sesión seguidos los agotarían.
    psql("truncate private.rate_limits");
    const mod = await import(`./scenarios/${f}`);
    const rep = createReporter(mod.title ?? f);
    console.log(`\n=== ${mod.title ?? f} ===`);
    try {
      await mod.run({ b: browser, mail, rep, env, sb, state, save, out: OUT, base: app.base });
    } catch (e) {
      rep.check(`${f}: sin excepción`, false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
      await browser.screenshot(`${OUT}/fallo-${f}.png`).catch(() => {});
    }
    allOk = rep.summary() && allOk;
  }
} finally {
  await browser.close();
  app.stop();
  if (!flags.has("--keep-assets")) {
    const ids = psql("select id from public.tickets").split(/\s+/).filter(Boolean);
    const r = await deleteTestAssets(env, [...ids.map((id) => `technoultra/tickets/${id}`), "technoultra/e2e-probe"]).catch(() => ({ deleted: 0 }));
    console.log(`Cloudinary: ${r.skipped ? "sin credenciales, nada que limpiar" : r.deleted + " activos de prueba eliminados"}`);
  }
}
console.log(allOk ? "\nE2E: TODO OK" : "\nE2E: HAY FALLOS");
process.exit(allOk ? 0 : 1);
