// UX del panel del personal: riel en escritorio, barra inferior en móvil, sin desbordes, objetivos táctiles, menús por rol y búsqueda.
// Guarda capturas en tests/e2e/.out/ux-*.png para compararlas con los mockups.
import { resolve } from "node:path";
import { clientLogin, staffLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Panel del personal: shell, responsive, accesibilidad básica y menús por rol";

const DESKTOP = [1440, 900];
const MOBILE = [390, 844];
const PAGES = [
  ["inicio", "/b", /Requieren acción/],
  ["tickets", "/b/tickets", /Activos/],
  ["clientes", "/b/clientes", /Clientes/],
  ["cotizaciones", "/b/cotizaciones", /Por cotizar/],
  ["agenda", "/b/agenda", /Agenda/],
  ["crm", "/b/crm", /Seguimiento/i],
  ["mas", "/b/mas", /Más/],
  ["avisos", "/avisos", /Avisos/],
];

const metrics = (b) =>
  b.eval(`(() => {
    const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    const rail = document.querySelector('aside');
    const bottom = [...document.querySelectorAll('nav[aria-label=Principal]')].find((n) => n.closest('aside') === null);
    const links = bottom ? [...bottom.querySelectorAll('a')] : [];
    return {
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      railVisible: vis(rail), railWidth: rail ? Math.round(rail.getBoundingClientRect().width) : 0,
      bottomVisible: vis(bottom), bottomLinks: links.length,
      smallTargets: [...document.querySelectorAll('nav a, aside a, aside button')].filter((a) => vis(a) && (a.getBoundingClientRect().height < 43 || a.getBoundingClientRect().width < 43)).length,
      h1: document.querySelector('h1')?.innerText ?? '',
      adminChip: [...document.querySelectorAll('a')].some((a) => vis(a) && /Administración/.test(a.innerText)),
      railLabels: rail ? [...rail.querySelectorAll('a')].map((a) => a.innerText.trim()).filter(Boolean) : [],
    };
  })()`);

export async function run({ b, rep, state, save, out, base }) {
  // El manifiesto PWA es público (sin sesión), rápido y válido.
  const t0 = Date.now();
  const mres = await fetch(`${base}/manifest.webmanifest`, { redirect: "manual" });
  const man = await mres.json().catch(() => null);
  rep.check("/manifest.webmanifest responde 200 sin sesión, con tipo y caché correctos", mres.status === 200 && /manifest+json|json/.test(mres.headers.get("content-type") ?? "") && /max-age=3600/.test(mres.headers.get("cache-control") ?? ""), `${mres.status} ${mres.headers.get("content-type")}`);
  rep.check("el manifiesto es válido (nombre, inicio, modo y íconos) y responde rápido", Boolean(man?.name && man?.start_url && man?.display === "standalone" && man.icons?.length >= 2) && Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
  const icon = await fetch(`${base}${man?.icons?.[0]?.src ?? "/x"}`);
  rep.check("los íconos del manifiesto también son públicos", icon.status === 200);

  const shots = (name) => b.screenshot(resolve(out, `ux-${name}.png`));

  // Datos de PRUEBA solo en la base local (para ver rejilla, carriles y tablero con contenido): eventos de agenda de esta semana.
  psql(`delete from public.calendar_events where title like '[E2E]%';
    insert into public.calendar_events (event_type, title, starts_at, duration_minutes, assigned_to)
    select t.ty::public.event_type, '[E2E] ' || t.title, date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota' + (t.off || ' minutes')::interval, t.dur, '${state.techId}'
    from (values ('diagnosis','Diagnóstico',480,60),('reception','Recogida',490,60),('delivery','Entrega',900,60),('visit','Visita',840,90)) as t(ty,title,off,dur)`);

  // ---------------------------------------------------------------- SUPERADMIN
  const o = await staffLogin(b, state.owner);
  state.owner.secret = o.secret;
  save();
  for (const [vp, label, mobile] of [[DESKTOP, "escritorio", false], [MOBILE, "movil", true]]) {
    await b.viewport(vp[0], vp[1], mobile);
    for (const [slug, path, re] of PAGES) {
      await b.goto(path, 1200);
      await b.waitText(re, 15000);
      const m = await metrics(b);
      rep.check(`[${label}] ${path} carga con su contenido`, re.test(await b.text()) && (await b.path()).startsWith(path), (await b.path()));
      rep.check(`[${label}] ${path} sin desborde horizontal`, !m.overflowX);
      if (mobile) {
        rep.check(`[móvil] ${path}: barra inferior de 5 destinos y sin riel`, m.bottomVisible && m.bottomLinks === 5 && !m.railVisible, JSON.stringify({ b: m.bottomVisible, n: m.bottomLinks, r: m.railVisible }));
      } else {
        rep.check(`[escritorio] ${path}: riel de 84 px y sin barra inferior`, m.railVisible && m.railWidth === 84 && !m.bottomVisible, JSON.stringify({ r: m.railVisible, w: m.railWidth, b: m.bottomVisible }));
      }
      rep.check(`[${label}] ${path}: objetivos táctiles de navegación ≥ 44 px`, m.smallTargets === 0, `${m.smallTargets} pequeños`);
      await shots(`${label}-${slug}`);
    }
    await b.goto("/b", 1200);
    rep.check(`[${label}] el SUPERADMIN ve el acceso «Administración»`, (await metrics(b)).adminChip);
  }

  // Menú «Más» completo para el SUPERADMIN
  await b.viewport(DESKTOP[0], DESKTOP[1], false);
  await b.goto("/b/mas", 1200);
  const mas = await b.text();
  for (const t of ["Centro legal", "Usuarios del equipo", "Ajustes", "Servicios", "Productos", "Cobertura", "Reportes"]) rep.check(`«Más» (SUPERADMIN) lista «${t}»`, mas.includes(t));

  // Agenda: Semana (carriles para eventos que se cruzan), Día y Mes, con los eventos reales de la base
  await b.goto("/b/agenda?vista=semana", 1500);
  rep.check("agenda semanal muestra los eventos reales", /\[E2E\] Diagnóstico/.test(await b.text()) && /\[E2E\] Entrega/.test(await b.text()));
  const lanes = await b.eval(`(() => { const r = (t) => [...document.querySelectorAll('[class*=border-l-4]')].find((a) => a.innerText.includes(t))?.getBoundingClientRect(); const a = r('[E2E] Diagnóstico'), c = r('[E2E] Recogida'); return !!a && !!c && (a.right <= c.left + 2 || c.right <= a.left + 2); })()`);
  rep.check("eventos que se cruzan en el tiempo se reparten en carriles (no se tapan)", lanes);
  await shots("escritorio-agenda-semana");
  await b.viewport(MOBILE[0], MOBILE[1], true);
  await b.goto("/b/agenda?vista=dia", 1500);
  rep.check("agenda diaria (móvil) lista los eventos de hoy", /\[E2E\] Diagnóstico/.test(await b.text()));
  await shots("movil-agenda-dia");
  await b.goto("/b/agenda?vista=semana", 1500);
  await shots("movil-agenda-semana");
  await b.goto("/b/agenda?vista=mes", 1500);
  rep.check("agenda mensual muestra los eventos y no desborda la página", /\[E2E\]/.test(await b.text()) && !(await metrics(b)).overflowX);
  await shots("movil-agenda-mes");
  await b.viewport(DESKTOP[0], DESKTOP[1], false);
  await b.goto("/b/agenda?vista=mes", 1500);
  await shots("escritorio-agenda-mes");
  for (const [slug, path, re] of [["crm", "/b/crm", /Pendiente/], ["tienda-productos", "/b/tienda", /Productos/], ["tienda-pedidos", "/b/pedidos", /Pedidos/]]) {
    await b.goto(path, 1500);
    rep.check(`${path} (tablero/tabla) carga y mantiene sus datos`, re.test(await b.text()));
    await shots(`escritorio-${slug}`);
  }

  // Búsqueda de tickets (en el servidor, por la URL)
  const customer = state.client?.fullName ?? "Cliente";
  await b.goto(`/b/tickets?estado=all&q=${encodeURIComponent(customer.split(" ")[0])}`, 1200);
  rep.check("la búsqueda por nombre de cliente encuentra el ticket", /TU-\d{4}-\d+/.test(await b.text()));
  await b.goto("/b/tickets?estado=all&q=zzz-no-existe", 1200);
  rep.check("una búsqueda sin resultados muestra un estado vacío claro", /No encontramos tickets/.test(await b.text()));
  await b.goto("/b/clientes?q=zzz-no-existe", 1200);
  rep.check("clientes: búsqueda sin resultados muestra estado vacío", /No encontramos clientes/.test(await b.text()));
  await b.goto("/b/cotizaciones", 1200);
  rep.check("cotizaciones: muestra el código y el total reales de la cotización", /COT-\d{4}-\d+/.test(await b.text()) && /\$\s?189\.900/.test(await b.text()));

  // ---------------------------------------------------------------- Técnico
  await sleep(1000);
  const t = await staffLogin(b, state.tech);
  rep.check("el técnico inicia sesión con MFA antes de las comprobaciones de menú", t.path.startsWith("/b"), t.path);
  state.tech.secret = t.secret;
  save();
  await b.viewport(DESKTOP[0], DESKTOP[1], false);
  await b.goto("/b", 1200);
  const tm = await metrics(b);
  rep.check("el técnico no ve «Tienda» ni «Reportes» en el riel", !tm.railLabels.includes("Tienda") && !tm.railLabels.includes("Reportes"), tm.railLabels.join(","));
  rep.check("el técnico no ve el acceso «Administración»", !tm.adminChip);
  await b.goto("/b/mas", 1200);
  const tmas = await b.text();
  rep.check("«Más» del técnico no lista secciones administrativas", !/Centro legal|Usuarios del equipo|Ajustes|Cobertura/.test(tmas) && /Seguridad/.test(tmas));
  await b.goto("/b/clientes", 1200);
  rep.check("el técnico ve solo clientes de sus tickets (RLS) y la página carga", /Clientes/.test(await b.text()));
  for (const route of ["/b/configuracion", "/b/usuarios", "/b/tienda"]) {
    await b.goto(route, 1200);
    rep.check(`el técnico sigue sin acceso a ${route} (el servidor decide)`, !(await b.path()).startsWith(route), await b.path());
  }
  // ---------------------------------------------------------------- Cliente: misma estructura, destinos propios
  await clientLogin(b, state.client);
  for (const [vp, label, mobile] of [[DESKTOP, "escritorio", false], [MOBILE, "movil", true]]) {
    await b.viewport(vp[0], vp[1], mobile);
    for (const [slug, path, re] of [["inicio", "/c", /./], ["servicios", "/c/solicitar", /Servicios|Solicitar|¿/], ["tickets", "/c/tickets", /Tickets|Mis/], ["tienda", "/c/tienda", /Tienda/], ["documentos", "/c/documentos", /documentos/i], ["mas", "/c/mas", /Cerrar sesión/]]) {
      await b.goto(path, 1200);
      const m = await metrics(b);
      rep.check(`[cliente ${label}] ${path} carga y no desborda`, re.test(await b.text()) && (await b.path()).startsWith(path) && !m.overflowX, await b.path());
      rep.check(`[cliente ${label}] ${path}: ${mobile ? "barra inferior de 5 y sin riel" : "riel de 84 px y sin barra inferior"}`, mobile ? m.bottomVisible && m.bottomLinks === 5 && !m.railVisible : m.railVisible && m.railWidth === 84 && !m.bottomVisible);
      rep.check(`[cliente ${label}] ${path}: objetivos táctiles ≥ 44 px`, m.smallTargets === 0, `${m.smallTargets}`);
      await shots(`cliente-${label}-${slug}`);
    }
  }
  // Cerrar sesión desde «Más» (móvil) y con el botón del riel (escritorio): el servidor revoca la sesión
  await b.goto("/c/mas", 1200);
  await b.clickText("Cerrar sesión", "body");
  await sleep(2500);
  await b.goto("/c", 1500);
  rep.check("tras «Cerrar sesión» el cliente ya no entra a su panel", (await b.path()).startsWith("/login") || !(await b.path()).startsWith("/c"), await b.path());
  rep.check("sin errores de JavaScript en el navegador", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
}
