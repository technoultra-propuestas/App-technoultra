// Reingeniería del flujo: pagos manuales con método/comprobante (sin duplicar), cotización por conceptos (pregunta y rechazo con motivo),
// «Próxima acción» del técnico, «Ahora estamos aquí» del cliente y Shop dentro de la app con la navegación inferior.
import { resolve } from "node:path";
import { clientLogin, must, staffLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Pagos manuales, cotización por conceptos, próxima acción y Shop con navegación";

const PHOTO = resolve("tests/e2e/fixtures/foto-prueba.png");
const q = (sql) => psql(sql);
const clickAdd = (b, nth = 0) => b.eval(`(() => { const x = [...document.querySelectorAll('article button')].filter((e) => /\\+ Agregar/.test(e.innerText))[${nth}]; if (!x) return false; x.click(); return true; })()`);
const noOverflow = (b) => b.eval("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1");
const PAY_FORM = "form:has(select[name=method]):has(input[name=kind])";

export async function run({ b, rep, state, save }) {
  const customer = q(`select c.id from customers c join profiles p on p.id = c.profile_id where p.email = '${state.client.email}'`);
  // «Diagnóstico básico»: servicio de precio fijo con pago inmediato (el caso real del cliente que paga $39.900).
  const diagSvc = q(`select id from services where slug = 'diagnostico-basico'`);
  const price = Number(q(`select base_price::int from services where id = '${diagSvc}'`));
  const money = `$${price.toLocaleString("es-CO")}`;
  const newTicket = () => q(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ('${customer}', '${diagSvc}', 'store', 'Se calienta y se apaga solo (E2E de pagos).', '${state.techId}') returning id`).split("\n")[0];
  const staff = async (who) => {
    const r = await staffLogin(b, state[who]);
    state[who].secret = r.secret;
    save();
  };
  await b.viewport(1440, 900);

  // ---------------------------------------------------------------- B · el cliente no pagó: el técnico ve «Pago pendiente» y registra efectivo
  const t1 = newTicket();
  await staff("tech");
  await b.goto(`/b/tickets/${t1}`, 1500);
  await must(b, /Pago pendiente/, 15000);
  let txt = await b.text();
  rep.check("el técnico ve «Próxima acción» (recibir el equipo) y el pago del diagnóstico como «Pago pendiente»", /Próxima acción/i.test(txt) && /Recibir el equipo/.test(txt) && /Pago del servicio/.test(txt) && txt.includes(money), JSON.stringify({ p: /Próxima acción/.test(txt), r: /Recibir el equipo/.test(txt), s: /Pago del servicio/.test(txt), m: txt.includes(money) }));
  await sleep(1200);
  await b.fillIn(PAY_FORM, "method", "cash");
  await b.clickText(`Registrar pago manual · ${money}`, "body");
  await sleep(3500);
  const p1 = q(`select provider || '|' || method || '|' || status || '|' || amount::int || '|' || (confirmed_by = '${state.techId}') from payments where ticket_id = '${t1}'`);
  rep.check("efectivo: pago manual confirmado por el técnico, con monto del servidor", p1 === `manual|cash|approved|${price}|true`, p1);
  rep.check("el servicio queda pagado (prepaid) por el monto del servidor", q(`select prepaid_at is not null from tickets where id = '${t1}'`) === "t");
  await b.goto(`/b/tickets/${t1}`, 1500);
  txt = await b.text();
  rep.check("tras el pago confirmado se muestra método y fecha y NO «Registrar pago»", /Pago confirmado/.test(txt) && /Método: Efectivo/.test(txt) && !/Registrar pago manual/.test(txt), txt.slice(0, 80));
  rep.check("no se puede registrar el mismo pago dos veces (servidor)", q(`select count(*) from payments where ticket_id = '${t1}'`) === "1");

  // el cliente: «Pago confirmado», sin botón «Pagar», con lo que sigue
  await clientLogin(b, state.client);
  await b.goto(`/c/tickets/${t1}`, 2000);
  txt = await b.text();
  rep.check("cliente: «Ahora estamos aquí» → pendiente de recibir el equipo, pago confirmado y sin «Pagar»", /Ahora estamos aquí/i.test(txt) && /Pendiente de recibir tu equipo/.test(txt) && /Pago confirmado/.test(txt) && !/Pagar ·/.test(txt) && !/Mercado ?Pago/i.test(txt));
  rep.check("«Recibido» no aparece para una solicitud sin equipo", !/\bRecibido\b/.test(txt.replace(/Solicitud recibida/gi, "")));

  // ---------------------------------------------------------------- C · datáfono: comprobante obligatorio → pago confirmado
  const t2 = newTicket();
  await staff("tech");
  await b.goto(`/b/tickets/${t2}`, 1500);
  await must(b, /Registrar pago manual/, 15000);
  await sleep(1200);
  await b.fillIn(PAY_FORM, "method", "datafono");
  await sleep(500);
  const disabled = await b.eval(`document.querySelector(${JSON.stringify(PAY_FORM)})?.querySelector('button[type=submit]')?.disabled`);
  rep.check("datáfono: sin foto del comprobante el botón de registrar está deshabilitado y lo explica", disabled === true && /comprobante/i.test(await b.text()));
  for (let attempt = 0; attempt < 3 && q(`select count(*) from evidence where ticket_id = '${t2}' and stage = 'payment'`) === "0"; attempt++) {
    await b.waitHydrated("input[type=file]");
    await b.eval("document.querySelectorAll('input[type=file]').forEach((x) => { x.value = ''; })");
    await b.setFiles("input[type=file]", [PHOTO], 0);
    for (let i = 0; i < 40 && q(`select count(*) from evidence where ticket_id = '${t2}' and stage = 'payment'`) === "0"; i++) await sleep(500);
  }
  rep.check("el comprobante se sube a Cloudinary (privado) y queda registrado como evidencia de pago", q(`select count(*) from evidence where ticket_id = '${t2}' and stage = 'payment' and slot = 'voucher'`) === "1");
  await sleep(800);
  await b.fillIn(PAY_FORM, "reference", "AP-E2E-001");
  await b.clickText("Registrar pago manual", "body");
  await sleep(3500);
  const p2 = q(`select method || '|' || status || '|' || reference || '|' || (voucher_evidence_id is not null) || '|' || (confirmed_by = '${state.techId}') from payments where ticket_id = '${t2}'`);
  rep.check("datáfono: pago confirmado con método, referencia, comprobante y usuario que lo registró", p2 === "datafono|approved|AP-E2E-001|true|true", p2);
  rep.check("el pago deja rastro en la auditoría con el método", Number(q(`select count(*) from audit_logs where action = 'payment.manual_confirmed' and metadata ->> 'purpose' = 'service'`)) >= 2);

  // ---------------------------------------------------------------- transferencia: pendiente de validación hasta que el SUPERADMIN la confirma
  const t3 = newTicket();
  await b.goto(`/b/tickets/${t3}`, 1500);
  await must(b, /Registrar pago manual/, 15000);
  await sleep(1200);
  await b.fillIn(PAY_FORM, "method", "bank_transfer");
  await sleep(400);
  await b.fillIn(PAY_FORM, "reference", "TRX-E2E-9");
  await b.clickText("Registrar pago manual", "body");
  await sleep(3500);
  rep.check("transferencia: queda «pendiente» (no se asume confirmada) y no cuenta como pagada", q(`select status from payments where ticket_id = '${t3}'`) === "pending" && q(`select prepaid_at is null from tickets where id = '${t3}'`) === "t");
  await b.goto(`/b/tickets/${t3}`, 1500);
  txt = await b.text();
  rep.check("el técnico ve «Pago en validación», sin formulario de registro y sin poder confirmarla", /Pago en validación/.test(txt) && !/Registrar pago manual/.test(txt) && !/Confirmar pago recibido/.test(txt));
  await staff("owner");
  await b.goto(`/b/tickets/${t3}`, 1500);
  await must(b, /Confirmar pago recibido/, 15000);
  await sleep(1200);
  await b.clickText("Confirmar pago recibido", "body");
  await sleep(3500);
  rep.check("el SUPERADMIN valida la transferencia y el pago queda confirmado", q(`select status from payments where ticket_id = '${t3}'`) === "approved" && q(`select prepaid_at is not null from tickets where id = '${t3}'`) === "t");

  // ---------------------------------------------------------------- D/E · cotización: pregunta (se responde) y rechazo con motivo
  const t4 = newTicket();
  const quote = q(`with q as (insert into quotes (ticket_id, customer_id) values ('${t4}', '${customer}') returning id)
    select id from q`).split("\n")[0];
  q(`insert into quote_items (quote_id, position, kind, description, qty, unit_price, concept, warranty_days) values ('${quote}', 1, 'custom', 'Limpieza profunda', 1, 60000, 'labor', 30), ('${quote}', 2, 'custom', 'Pasta térmica', 1, 25000, 'part', 0);
    update quotes set status = 'sent', sent_at = now(), valid_until = current_date + 7 where id = '${quote}';
    update tickets set status = 'diagnosing' where id = '${t4}';
    update tickets set status = 'awaiting_approval' where id = '${t4}';`);
  await clientLogin(b, state.client);
  await b.viewport(390, 844, true);
  await b.goto(`/c/tickets/${t4}/cotizacion`, 2000);
  txt = await b.text();
  rep.check("cotización: separa mano de obra y repuestos, muestra total y las tres decisiones", /Mano de obra y servicios/i.test(txt) && /Repuestos/i.test(txt) && /\$85\.000/.test(txt) && /Aprobar cotización/.test(txt) && /Tengo una pregunta/.test(txt) && /Rechazar/.test(txt), txt.replace(/\s+/g, " ").slice(0, 300));
  rep.check("móvil: el visor de la cotización no desborda y mantiene la barra de decisión", (await noOverflow(b)) && (await b.eval(`!!document.querySelector('nav[aria-label=Principal]')`)));
  await sleep(800);
  await b.clickText("Tengo una pregunta", "#contenido");
  await sleep(500);
  await b.fill("message", "¿La pasta térmica tiene garantía?");
  await b.clickText("Enviar pregunta", "#contenido");
  await sleep(3500);
  rep.check("la pregunta queda asociada a la cotización y no pierde contexto", q(`select status from quotes where id = '${quote}'`) === "clarification" && q(`select count(*) from quote_events where quote_id = '${quote}' and event_type = 'question' and message like '%garantía%'`) === "1");
  await b.viewport(1440, 900);
  await staff("tech");
  await b.goto(`/b/tickets/${t4}`, 1500);
  await must(b, /Pregunta del cliente/, 15000);
  txt = await b.text();
  rep.check("el técnico ve la pregunta y la «Próxima acción» es responderla", /garantía/.test(txt) && /El cliente tiene una pregunta/.test(txt));
  await sleep(1200);
  await b.fillIn("form:has(input[name=quoteId]):has(textarea[name=message])", "message", "Sí: 30 días de garantía en mano de obra.");
  await b.submitIn("form:has(input[name=quoteId]):has(textarea[name=message])");
  await sleep(3500);
  rep.check("la respuesta queda registrada en la cotización", Number(q(`select count(*) from quote_events where quote_id = '${quote}' and event_type = 'answered'`)) >= 1);
  await clientLogin(b, state.client);
  await b.goto(`/c/tickets/${t4}/cotizacion`, 2000);
  rep.check("el cliente ve la respuesta del técnico en el visor", /30 días de garantía/.test(await b.text()));
  await sleep(800);
  await b.clickText("Rechazar", "#contenido");
  await sleep(500);
  await b.fill("message", "Es más de lo que puedo pagar ahora.");
  await b.clickText("Confirmar rechazo", "#contenido");
  await sleep(3500);
  rep.check("rechazo: queda registrado con el motivo", q(`select status from quotes where id = '${quote}'`) === "rejected" && q(`select count(*) from quote_events where quote_id = '${quote}' and event_type = 'rejected' and message like '%más de lo que puedo%'`) === "1");
  await staff("tech");
  await b.goto(`/b/tickets/${t4}`, 1500);
  txt = await b.text();
  rep.check("el técnico ve «Cotización rechazada por el cliente» con el motivo", /Cotización rechazada por el cliente/.test(txt) && /más de lo que puedo/.test(txt));

  // ---------------------------------------------------------------- F · Shop dentro de la app: navegación inferior en Shop, producto y carrito
  await clientLogin(b, state.client);
  await b.viewport(390, 844, true);
  const navOn = () => b.eval(`(() => { const n = document.querySelector('nav[aria-label=Principal].fixed'); if (!n) return ''; const on = n.querySelector('[aria-current=page]'); return (on?.innerText ?? '').trim() + '|' + getComputedStyle(n).position; })()`);
  await b.eval(`localStorage.removeItem('technoultra-shop-cart-v2')`);
  await b.goto("/tienda", 2500);
  rep.check("Shop: la navegación inferior sigue visible y marca «Shop»", /^Shop\|fixed$/.test(await navOn()), await navOn());
  rep.check("Shop: sigue visible el cintillo de envíos (Cali urbano / zonas aledañas)", /Cali/.test(await b.text()) && /\$10\.000/.test(await b.text()));
  const slug = q(`select slug from products where source_product_id = 'E2E-M1'`);
  if (slug) {
    await b.goto(`/tienda/producto/${slug}`, 2000);
    rep.check("producto: conserva la navegación inferior", /^Shop\|fixed$/.test(await navOn()), await navOn());
  }
  await b.goto("/tienda", 2000);
  const added = await clickAdd(b, 0);
  await sleep(600);
  await b.goto("/tienda/carrito", 2500);
  rep.check("carrito: conserva la navegación inferior y el producto agregado", added && /^Shop\|fixed$/.test(await navOn()) && /Subtotal/.test(await b.text()), await navOn());
  const wa = await b.eval(`[...document.querySelectorAll('a')].find((a) => /Comprar por WhatsApp/.test(a.innerText))?.href ?? ''`);
  const msg = decodeURIComponent(wa.split("?text=")[1] ?? "");
  rep.check("WhatsApp: un solo mensaje con precio publicado, cantidad, subtotal y entrega pendiente (sin «precio actual»)", wa.startsWith("https://wa.me/573183943465?text=") && /Cantidad: 1/.test(msg) && /Subtotal productos: \$/.test(msg) && /Entrega:\nPendiente de confirmar/.test(msg) && !/precio actual/i.test(msg));
  await b.eval(`[...document.querySelectorAll('a')].find((a) => /Comprar por WhatsApp/.test(a.innerText))?.removeAttribute('target')`);
  await b.eval(`document.querySelector('a[href^="https://wa.me/"]')?.addEventListener('click', (e) => e.preventDefault(), { once: true })`);
  await b.clickText("Comprar por WhatsApp", "#contenido");
  await sleep(600);
  txt = await b.text();
  rep.check("carrito: tras enviar muestra «Pedido enviado a WhatsApp» y no finge un pago", /Pedido enviado a WhatsApp/.test(txt) && /Todavía no hay ningún cobro/.test(txt));
  rep.check("Shop y carrito sin desbordes en móvil", await noOverflow(b));
  await b.viewport(1440, 900);
  await b.goto("/tienda", 2000);
  rep.check("escritorio: el Shop conserva el riel lateral de la app", await b.eval(`!!document.querySelector('aside nav[aria-label=Principal]')`));
  rep.check("sin errores de JavaScript en estos flujos", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
}
