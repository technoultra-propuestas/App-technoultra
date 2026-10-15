// Auditoría visual: captura las pantallas del cliente y del personal en escritorio (1440), tableta (820) y móvil (390) y mide desbordes horizontales.
// Uso: node tests/e2e/audit-desktop.mjs [carpeta-de-salida]   (requiere el estado de una corrida E2E: `node tests/e2e/run.mjs --reset 01 02 03 --keep-assets`)
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Browser, sleep } from "./lib/browser.mjs";
import { startApp } from "./lib/app.mjs";
import { clientLogin, staffLogin } from "./lib/actors.mjs";
import { psql } from "./lib/fixtures.mjs";

const out = resolve(process.argv[2] ?? "tests/e2e/.out/audit");
mkdirSync(out, { recursive: true });
const state = JSON.parse(readFileSync("tests/e2e/.state.json", "utf8"));
const q = (s) => psql(s).split("\n")[0];
const ticket = state.flow?.ticketId ?? q("select id from tickets order by created_at limit 1");
const doc = q(`select id from documents where ticket_id = '${ticket}' order by created_at limit 1`);
const equip = q("select id from equipment limit 1");
const slug = q("select slug from services where 'home' = any (allowed_modalities) and 'store' = any (allowed_modalities) and is_active limit 1");
const slugLocal = q("select slug from services where allowed_modalities = '{store}' and requires_equipment and is_active limit 1");
const client = [
  ["c-inicio", "/c"], ["c-solicitar", "/c/solicitar"], ["c-solicitar-servicio", `/c/solicitar/${slug}`], ["c-solicitar-local", `/c/solicitar/${slugLocal}`],
  ["c-tickets", "/c/tickets"], ["c-ticket", `/c/tickets/${ticket}`], ["c-cotizacion", `/c/tickets/${ticket}/cotizacion`],
  ["c-equipos", "/c/equipos"], ["c-equipo-nuevo", "/c/equipos/nuevo"], ["c-equipo", `/c/equipos/${equip}`], ["c-direcciones", "/c/direcciones"],
  ["c-documentos", "/c/documentos"], ["c-documento", `/c/documentos/${doc}`], ["c-documento-visor", `/c/documentos/${doc}/ver?from=${encodeURIComponent(`/c/tickets/${ticket}`)}`],
  ["c-pedidos", "/c/pedidos"], ["c-carrito", "/c/carrito"], ["c-perfil", "/c/perfil"], ["c-mas", "/c/mas"], ["c-ayuda", "/c/ayuda"], ["c-asistente", "/c/asistente"], ["c-tienda", "/c/tienda"], ["notificaciones-c", "/notificaciones"],
];
const staff = [
  ["b-inicio", "/b"], ["b-tickets", "/b/tickets"], ["b-ticket", `/b/tickets/${ticket}`], ["b-ticket-nuevo", "/b/tickets/nuevo"], ["b-documento-visor", `/b/documentos/${doc}`],
  ["b-solicitudes", "/b/solicitudes"], ["b-clientes", "/b/clientes"], ["b-crm", "/b/crm"], ["b-agenda", "/b/agenda"], ["b-cotizaciones", "/b/cotizaciones"], ["b-pedidos", "/b/pedidos"],
  ["b-servicios", "/b/servicios"], ["b-servicio-nuevo", "/b/servicios/nuevo"], ["b-tienda", "/b/tienda"], ["b-shop", "/b/tienda/shop"], ["b-proyectos", "/b/proyectos"],
  ["b-comercial", "/b/comercial"], ["b-cobertura", "/b/cobertura"], ["b-configuracion", "/b/configuracion"], ["b-usuarios", "/b/usuarios"], ["b-reportes", "/b/reportes"],
  ["b-seguridad", "/b/seguridad"], ["b-privacidad", "/b/privacidad"], ["b-legal", "/b/legal"], ["b-conocimiento", "/b/conocimiento"], ["b-mas", "/b/mas"],
];
const sizes = [["pc", 1440, 900, false], ["tab", 820, 1100, false], ["mov", 390, 844, true]];

const app = await startApp({ mode: "start" });
const b = await Browser.launch({ baseUrl: app.base, profileDir: join(tmpdir(), "tu-audit-desktop") });
const report = [];
async function run(list) {
  for (const [name, path] of list) {
    for (const [tag, w, h, mobile] of sizes) {
      await b.viewport(w, h, mobile);
      await b.goto(path, 1500);
      const m = await b.eval(`(() => { const d = document.documentElement; const main = document.querySelector('#contenido') ?? document.body; const r = main.getBoundingClientRect(); return { over: d.scrollWidth - d.clientWidth, contentW: Math.round(r.width), h: d.scrollHeight, title: document.title, err: /Internal Server Error|Application error|404/i.test(document.body.innerText.slice(0, 400)), off: d.scrollWidth - d.clientWidth > 1 ? [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().width > 0).slice(0, 4).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).slice(0, 80)) : [] }; })()`);
      report.push({ name, tag, path: await b.path(), ...m });
      await b.screenshot(join(out, `${name}-${tag}.png`));
    }
  }
}
try {
  await clientLogin(b, state.client);
  await run(client);
  await staffLogin(b, state.owner);
  await run(staff);
} finally {
  console.log(JSON.stringify(report));
  await b.close();
  app.stop();
}
