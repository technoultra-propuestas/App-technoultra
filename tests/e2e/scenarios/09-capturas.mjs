// Capturas para la auditoría visual (móvil y escritorio) de las pantallas rediseñadas. Se guardan en tests/e2e/.out/vis-*.png.
import { resolve } from "node:path";
import { clientLogin, staffLogin } from "../lib/actors.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Capturas de auditoría visual (Shop, cliente y personal)";

const DESKTOP = [1440, 900, false];
const MOBILE = [390, 844, true];

export async function run({ b, rep, state, save, out }) {
  const shot = async (name, path, [w, h, m], settle = 1800) => {
    await b.viewport(w, h, m);
    await b.goto(path, settle);
    await b.screenshot(resolve(out, `vis-${name}-${m ? "movil" : "escritorio"}.png`));
  };
  const customer = psql(`select c.id from customers c join profiles p on p.id = c.profile_id where p.email = '${state.client.email}'`);
  const svc = psql(`select id from services where slug = 'diagnostico-basico'`);
  const ticket = psql(`select id from tickets where customer_id = '${customer}' order by created_at desc limit 1`) || psql(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ('${customer}', '${svc}', 'store', 'Captura', '${state.techId}') returning id`).split("\n")[0];
  psql(`insert into shop_banners (title, subtitle, cta_label, cta_href, is_active, priority) select 'Semana de componentes', 'Procesadores, memorias y fuentes con garantía TechnoUltra', 'Ver componentes', '/tienda/categoria/componentes', true, 1 where not exists (select 1 from shop_banners)`);

  // Shop público
  await b.clearCookies();
  for (const v of [DESKTOP, MOBILE]) {
    await shot("shop", "/tienda", v, 2500);
    await shot("shop-categoria", "/tienda/categoria/componentes", v);
    await shot("shop-producto", (await b.eval(`document.querySelector('a[href^="/tienda/producto/"]')?.getAttribute('href')`)) ?? "/tienda", v);
  }
  await b.viewport(...MOBILE);
  await b.goto("/tienda", 2000);
  await b.eval(`[...document.querySelectorAll('main button')].find((x) => /Filtros/.test(x.innerText))?.click()`);
  await b.screenshot(resolve(out, "vis-shop-filtros-movil.png"));
  await b.eval(`localStorage.setItem('technoultra-shop-cart-v2', JSON.stringify([]))`);
  await b.goto("/tienda", 1500);
  await b.eval(`[...document.querySelectorAll('article button')].slice(0, 3).forEach((x) => x.click())`);
  for (const v of [DESKTOP, MOBILE]) await shot("shop-carrito", "/tienda/carrito", v, 2500);

  // Cliente
  await clientLogin(b, state.client);
  for (const v of [DESKTOP, MOBILE]) {
    for (const [n, p] of [["cliente-inicio", "/c"], ["cliente-servicios", "/c/solicitar"], ["cliente-solicitud", "/c/solicitar/diagnostico-basico"], ["cliente-ticket", `/c/tickets/${ticket}`], ["cliente-equipos", "/c/equipos"], ["cliente-documentos", "/c/documentos"], ["cliente-perfil", "/c/perfil"], ["cliente-ayuda", "/c/ayuda"], ["cliente-mas", "/c/mas"]]) await shot(n, p, v);
  }

  // Personal
  const o = await staffLogin(b, state.owner);
  state.owner.secret = o.secret;
  save();
  for (const v of [DESKTOP, MOBILE]) {
    for (const [n, p] of [["staff-shop", "/b/tienda/shop"], ["staff-productos", "/b/tienda"], ["staff-legal", "/b/legal"], ["staff-comercial", "/b/comercial"], ["staff-cobertura", "/b/cobertura"], ["staff-ajustes", "/b/configuracion"], ["staff-proyectos", "/b/proyectos"], ["staff-ticket", `/b/tickets/${ticket}`]]) await shot(n, p, v);
  }
  rep.check("capturas generadas en tests/e2e/.out/vis-*.png", true);
}
