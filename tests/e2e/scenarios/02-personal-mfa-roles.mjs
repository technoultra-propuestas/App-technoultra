// Personal: acceso por /gestion/login con MFA obligatoria, límites por rol (técnico vs SUPERADMIN) y guardado de ajustes del negocio.
import { clientLogin, staffLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";

export const title = "Personal: MFA, roles y configuración del negocio";

const SUPERADMIN_ONLY = ["/b/configuracion", "/b/usuarios", "/b/legal", "/b/comercial", "/b/servicios", "/b/reportes"];

export async function run({ b, rep, state, save }) {
  // ---- técnico
  const t = await staffLogin(b, state.tech);
  state.tech.secret = t.secret;
  save();
  rep.check("el técnico entra al CRM tras enrolar y verificar el segundo factor", t.path.startsWith("/b"), t.path);
  for (const route of SUPERADMIN_ONLY) {
    await b.goto(route, 1500);
    const p = await b.path();
    rep.check(`el técnico NO puede abrir ${route}`, !p.startsWith(route), p);
  }
  await b.goto("/b/tickets", 1500);
  rep.check("el técnico sí abre la bandeja de tickets", (await b.path()).startsWith("/b/tickets"));

  // ---- cliente no entra por el portal del personal
  const c = state.client;
  if (c) {
    await clientLogin(b, c);
    await b.goto("/b", 1500);
    rep.check("un cliente no entra al CRM aunque conozca la ruta", !(await b.path()).startsWith("/b"), await b.path());
  }

  // ---- superadmin
  const o = await staffLogin(b, state.owner);
  state.owner.secret = o.secret;
  save();
  rep.check("el SUPERADMIN entra con MFA", o.path.startsWith("/b"), o.path);
  for (const route of SUPERADMIN_ONLY) {
    await b.goto(route, 2500);
    rep.check(`el SUPERADMIN sí abre ${route}`, (await b.path()).startsWith(route), await b.path());
  }

  // ---- guardado de ajustes (causa del bug de producción: upsert exigía UPDATE sobre la clave)
  await b.goto("/b/configuracion", 2500);
  const form = 'form:has(input[name=key][value="business.phone"])';
  await b.fillIn(form, "value", "3183943465");
  await b.submitIn(form);
  await sleep(2500);
  await b.goto("/b/configuracion", 2500);
  const saved = await b.eval(`document.querySelector('${form} [name=value]')?.value`);
  rep.check("el teléfono del negocio se guarda y persiste tras recargar", saved === "3183943465", String(saved));

  await b.fillIn(form, "value", "abc");
  await b.submitIn(form);
  await b.waitText(/Teléfono no válido/i, 8000);
  rep.check("un valor inválido se rechaza con mensaje claro (VALIDATION_ERROR)", /Teléfono no válido/i.test(await b.text()));

  await b.fillIn(form, "value", "3183943465");
  await b.submitIn(form);
  await sleep(1500);
  rep.check("sin errores de JavaScript en el navegador", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
}
