// Regresión de «Enviar al cliente»: con el ticket en «Recibido» el botón no debe ofrecer una acción que el servidor rechazará,
// y explica por qué. (El envío exitoso desde «En diagnóstico» ya lo cubre la cadena completa del escenario 03.)
import { staffLogin } from "../lib/actors.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Cotización: «Enviar al cliente» según el estado del ticket";

export async function run({ b, rep, state, save }) {
  const customer = psql(`select c.id from customers c join profiles p on p.id = c.profile_id where p.email = '${state.client.email}'`);
  const service = psql(`select id from services where slug = 'diagnostico-basico'`);
  const bios = psql(`select id from services where slug = 'actualizacion-bios-uefi'`);
  const ticket = psql(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ('${customer}', '${service}', 'store', 'Prueba E2E cotización en recibido', '${state.techId}') returning id`).split("\n")[0];
  const quote = psql(`insert into quotes (ticket_id, customer_id) values ('${ticket}', '${customer}') returning id`).split("\n")[0];
  psql(`insert into quote_items (quote_id, position, kind, service_id, description, qty, warranty_days) values ('${quote}', 1, 'service', '${bios}', 'Actualización BIOS/UEFI', 1, 0)`);
  const total = psql(`select total from quotes where id = '${quote}'`);
  rep.check("la cotización en borrador tiene el total calculado por el servidor", Number(total) > 0, total);

  const t = await staffLogin(b, state.tech);
  state.tech.secret = t.secret;
  save();
  await b.goto(`/b/tickets/${ticket}`, 1500);
  const text = await b.text();
  rep.check("el ticket está en «Recibido» y la cotización en «Borrador»", /Recibido/.test(text) && /Borrador/.test(text));
  const disabled = await b.eval(`(() => { const x = [...document.querySelectorAll('button')].find((e) => e.innerText.trim() === 'Enviar al cliente'); return !!x && x.disabled; })()`);
  rep.check("«Enviar al cliente» aparece deshabilitado (no ofrece una acción inválida)", disabled);
  rep.check("explica que el ticket debe estar «En diagnóstico»", /debe estar «En diagnóstico»/.test(text));
  rep.check("nada cambió: la cotización sigue en borrador y sin notificación", psql(`select status from quotes where id = '${quote}'`) === "draft" && psql(`select count(*) from notifications where entity_id = '${quote}'`) === "0");
  rep.check("sin errores de JavaScript en el navegador", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
}
