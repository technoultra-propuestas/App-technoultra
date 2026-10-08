// Auditoría automática de contraste AA (WCAG 2) con axe-core sobre las pantallas públicas, del cliente y del personal, en móvil y escritorio.
// Falla si axe encuentra elementos que no cumplen el contraste mínimo (4,5:1 texto normal, 3:1 texto grande/UI). No modifica la aplicación.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { clientLogin, staffLogin } from "../lib/actors.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Contraste AA automático (axe-core) en pantallas públicas, de cliente y de personal";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

async function audit(b, path) {
  await b.goto(path, 1200);
  await b.eval(AXE);
  // El logotipo (Wordmark, data-logotype) está exento de contraste según WCAG 1.4.3; el resto se audita.
  const res = await b.eval(`axe.run({ exclude: [["[data-logotype]"]] }, { runOnly: { type: "rule", values: ["color-contrast"] }, resultTypes: ["violations"] }).then((r) => r.violations.flatMap((v) => v.nodes.map((n) => ({ target: n.target.join(" "), summary: (n.any[0]?.message ?? "").slice(0, 140) }))))`);
  return res ?? [];
}

export async function run({ b, rep, state, save }) {
  const ticket = psql(`select id from tickets order by created_at desc limit 1`);
  const slug = psql(`select slug from products where source is not null limit 1`);
  const groups = [
    ["públicas", null, ["/", "/servicios", "/tienda", slug ? `/tienda/producto/${slug}` : null, "/tienda/carrito", "/login", "/registro", "/legal", "/soporte-remoto"]],
    ["cliente", "client", ["/c", "/c/solicitar", "/c/tickets", ticket ? `/c/tickets/${ticket}` : null, "/c/equipos", "/c/perfil", "/c/ayuda", "/c/mas", "/c/documentos", "/tienda"]],
    ["personal", "staff", ["/b", "/b/tickets", ticket ? `/b/tickets/${ticket}` : null, "/b/clientes", "/b/cotizaciones", "/b/agenda", "/b/tienda", "/b/tienda/shop", "/b/comercial", "/b/legal", "/b/configuracion"]],
  ];
  const all = [];
  for (const [name, who, pages] of groups) {
    if (who === "client") await clientLogin(b, state.client);
    if (who === "staff") {
      const r = await staffLogin(b, state.owner);
      state.owner.secret = r.secret;
      save();
    }
    if (!who) await b.clearCookies();
    for (const [w, h, mobile] of [[390, 844, true], [1440, 900, false]]) {
      await b.viewport(w, h, mobile);
      const bad = [];
      for (const p of pages.filter(Boolean)) {
        const v = await Promise.race([audit(b, p), new Promise((_, rej) => setTimeout(() => rej(new Error("tiempo agotado (30 s)")), 30000))]).catch((e) => [{ target: "(error)", summary: String(e.message).slice(0, 100) }]);
        for (const n of v) {
          bad.push(`${p} → ${n.target} — ${n.summary}`);
          all.push(`${w}px ${p} → ${n.target} — ${n.summary}`);
        }
      }
      rep.check(`${name} a ${w}px: sin incumplimientos de contraste AA`, bad.length === 0, bad.slice(0, 12).join(" || "));
    }
  }
  if (all.length) console.log("   CONTRASTE:", [...new Set(all)].slice(0, 60).join("\n   "));
}
