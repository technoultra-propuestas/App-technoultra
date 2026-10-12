// Cotización con productos del Shop (recomendados + buscador), aprobación con ANTICIPO del 50 % y SALDO al final, paneles del personal,
// bloques inferiores del seguimiento (acordeones, historial con colores reales), línea de tiempo superior intacta e instalación PWA.
import { resolve } from "node:path";
import { clientLogin, must, staffLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Cotización con productos del Shop, anticipo del 50 % / saldo y seguimiento compacto";

const q = (sql) => psql(sql);
const cop = (n) => `$${Number(n).toLocaleString("es-CO")}`;
const shot = (b, name) => b.screenshot(resolve("tests/e2e/.out", `cot-${name}.png`));
const noOverflow = (b) => b.eval("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1");
/** Escribe en un campo controlado por React que no tiene `name` (buscador). */
const typeInto = (b, selector, value) =>
  b.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const PRODUCT_ITEM = /^product\|product\|1\|(t|true)$/;

export async function run({ b, rep, state, save }) {
  const profile = q(`select id from profiles where email = '${state.client.email}'`);
  const customer = q(`select id from customers where profile_id = '${profile}'`);
  q(`insert into services (slug, name, kind, base_price, allowed_modalities, is_diagnostic_fee, requires_equipment, allow_online_payment) values ('diagnostico-tecnico-e2e', 'Diagnóstico técnico', 'technical', 39900, '{store,home,pickup}', true, false, true) on conflict (slug) do nothing`);
  const svc = q(`select id from services where slug = 'diagnostico-tecnico-e2e'`);
  // Ticket con el diagnóstico pagado (crédito $39.900), recibido y en diagnóstico, con un diagnóstico que menciona el teclado.
  const t = q(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ('${customer}', '${svc}', 'store', 'El teclado no responde las teclas (E2E 16).', '${state.techId}') returning id`).split("\n")[0];
  q(`select public.record_manual_service_payment_v2('${state.techId}', 'diagnosis', '${t}', 'cash', null, null, null)`);
  q(`insert into receptions (ticket_id, reason, received_by) values ('${t}', 'Teclado', '${state.techId}')`);
  for (const [i, slot] of ["front", "back", "screen", "serial"].entries()) q(`insert into evidence (ticket_id, stage, slot, cloudinary_public_id) values ('${t}', 'reception', '${slot}', 'e2e/${t}/${i}')`);
  if (q(`select status from tickets where id = '${t}'`) === "received") q(`select private.apply_transition('${t}', 'diagnosing', '${state.techId}', 'technician', null, true)`);
  q(`insert into diagnostics (ticket_id, summary, technician_id) values ('${t}', 'El teclado tiene varias teclas dañadas; se recomienda reemplazar el teclado.', '${state.techId}')`);
  const staff = async (who) => {
    const r = await staffLogin(b, state[who]);
    state[who].secret = r.secret;
    save();
  };

  // ---------------------------------------------------------------- 1 · técnico: producto recomendado → «Agregar a cotización»
  await staff("tech");
  await b.viewport(1440, 900);
  await b.goto(`/b/tickets/${t}`, 2000);
  let txt = await b.text();
  const hasReco = /Productos del Shop que podrían servir/.test(txt) && /Agregar a cotización/.test(txt);
  rep.check("el bloque de recomendaciones del Shop ofrece «Agregar a cotización»", hasReco, txt.slice(0, 120));
  if (hasReco) {
    await sleep(1200);
    await b.clickText("Agregar a cotización", "body");
    await sleep(3500);
    const quote1 = q(`select id from quotes where ticket_id = '${t}' and status = 'draft'`);
    const item = q(`select kind || '|' || concept || '|' || qty::int || '|' || (unit_price = (select price from products where id = quote_items.product_id)) from quote_items where quote_id = '${quote1}' and product_id is not null`);
    rep.check("sin cotización previa: crea el borrador y agrega el producto como «producto» con el precio vigente del catálogo", PRODUCT_ITEM.test(item), item);
    rep.check("muestra una confirmación breve junto al botón", /Agregado a la cotización/.test(await b.text()));
    await b.goto(`/b/tickets/${t}`, 2000);
    await sleep(1200);
    await b.clickText("Agregar a cotización", "body");
    await sleep(3500);
    rep.check("agregarlo otra vez aumenta la cantidad (no duplica la línea)", q(`select count(*) || '|' || max(qty)::int from quote_items where quote_id = '${quote1}' and product_id is not null`) === "1|2");
  }

  // ---------------------------------------------------------------- 2 · buscador de productos en «Agregar un concepto»
  if (!q(`select id from quotes where ticket_id = '${t}' and status = 'draft'`)) q(`insert into quotes (ticket_id, customer_id) values ('${t}', '${customer}')`);
  await b.goto(`/b/tickets/${t}`, 2000);
  await b.eval(`(() => { const d = [...document.querySelectorAll('details')].find((x) => /Agregar un concepto/.test(x.innerText)); if (d) d.open = true; return !!d; })()`);
  await sleep(800);
  await b.fillIn("form:has(input[name=quoteId]):has(select[name=kind])", "kind", "product");
  await sleep(800);
  await typeInto(b, "input[type=search]", "zzqqxx");
  await sleep(2500);
  rep.check("búsqueda sin resultados: mensaje claro", /Sin coincidencias/.test(await b.text()));
  // término real del catálogo, en MAYÚSCULAS y sin acentos (debe encontrarlo igual)
  const target = q(`select name from products where is_active and price > 0 and source_available and name ~* '[áéíóú]' order by name limit 1`) || q(`select name from products where is_active and price > 0 and source_available order by name limit 1`);
  const word = target.normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).find((w) => w.length >= 4) ?? target.slice(0, 4);
  await typeInto(b, "input[type=search]", word.toUpperCase());
  await sleep(2500);
  txt = await b.text();
  rep.check("busca en el servidor por nombre ignorando mayúsculas y acentos, con precio y disponibilidad", /\d+ resultados?/.test(txt) && /Disponible|Agotado/.test(txt), `${word} · ${(txt.match(/\d+ resultados?/) ?? [""])[0]}`);
  rep.check("no se descargó el catálogo completo al abrir el formulario (solo resultados de la búsqueda)", (await b.eval("document.querySelectorAll('select[name=refId] option').length")) === 0);
  await b.eval(`(() => { const btn = [...document.querySelectorAll('ul button[aria-pressed]')].find((x) => !x.disabled); if (btn) btn.click(); return !!btn; })()`);
  await sleep(600);
  rep.check("elegir un resultado no envía el formulario y muestra lo seleccionado", /Seleccionado:/.test(await b.text()));
  const before = Number(q(`select count(*) from quote_items qi join quotes qq on qq.id = qi.quote_id where qq.ticket_id = '${t}' and qq.status = 'draft'`));
  await b.submitIn("form:has(input[name=quoteId]):has(select[name=kind])");
  await sleep(3500);
  rep.check("«Agregar ítem» agrega el producto buscado con el precio del catálogo", Number(q(`select count(*) from quote_items qi join quotes qq on qq.id = qi.quote_id where qq.ticket_id = '${t}' and qq.status = 'draft'`)) === before + 1);
  // mano de obra para que la cotización tenga ambos conceptos
  const quote = q(`select id from quotes where ticket_id = '${t}' and status = 'draft'`);
  q(`insert into quote_items (quote_id, position, kind, description, qty, unit_price, concept, warranty_days) values ('${quote}', 50, 'custom', 'Cambio de teclado (mano de obra)', 1, 60000, 'labor', 30)`);
  await b.goto(`/b/tickets/${t}`, 2000);
  await sleep(1200);
  await b.clickText("Enviar al cliente", "body");
  await sleep(4000);
  rep.check("la cotización se envía al cliente", q(`select status from quotes where id = '${quote}'`) === "sent");

  // ---------------------------------------------------------------- 3 · cliente aprueba → elige cómo pagar (el servicio NO empieza)
  await clientLogin(b, state.client);
  await b.viewport(390, 844, true);
  await b.goto(`/c/tickets/${t}/cotizacion`, 2000);
  await must(b, /Aprobar cotización/, 15000);
  await sleep(1200);
  await b.clickText("Aprobar cotización", "body");
  await sleep(4000);
  const base = Number(q(`select base from private.quote_money('${quote}')`));
  const dep = Math.round(base * 0.5);
  const disc = Math.round(base * 0.05);
  await b.goto(`/c/tickets/${t}/cotizacion`, 2000);
  txt = await b.text();
  rep.check("tras aprobar: «¡Cotización aprobada!», crédito por diagnóstico aplicado y las dos modalidades con importes del servidor", /Cotización aprobada/.test(txt) && /Crédito por diagnóstico/.test(txt) && txt.includes(`Pagar anticipo · ${cop(dep)}`) && txt.includes(`Pagar total con 5 % de descuento · ${cop(base - disc)}`) && txt.includes(`ahorras ${cop(disc)}`), txt.slice(0, 160));
  rep.check("el ticket sigue esperando el pago (no se inicia la reparación)", q(`select status from tickets where id = '${t}'`) === "awaiting_approval");
  rep.check("móvil: las opciones de pago no desbordan", await noOverflow(b));
  await shot(b, "1-opciones-movil");

  // ---------------------------------------------------------------- 4 · seguimiento del cliente: línea superior intacta, bloques compactos
  await b.goto(`/c/tickets/${t}`, 2500);
  txt = await b.text();
  const timeline = await b.eval(`(() => { const ol = document.querySelector('[aria-label="Avance del servicio (desliza para ver todas las etapas)"] ol'); return ol ? [...ol.children].map((li) => li.innerText.split('\\n')[0]).join('|') + '#' + document.querySelectorAll('li[aria-current=step]').length : ''; })()`);
  rep.check("la línea de tiempo superior conserva sus etapas (Solicitud · Pago · Diagnóstico · Cotización · Reparación · Entrega)", timeline.startsWith("Solicitud|Pago|Diagnóstico|Cotización|Reparación|Entrega"), timeline);
  rep.check("acordeones cerrados por defecto (diagnóstico, resumen, IA, filas del avance)", (await b.eval("document.querySelectorAll('#contenido details[open]').length")) === 0 && /Resumen del servicio/.test(txt) && /¿Qué incluye el diagnóstico\?/.test(txt));
  await b.eval(`(() => { const d = [...document.querySelectorAll('details')].find((x) => /Resumen del servicio/.test(x.querySelector('summary')?.innerText ?? '')); d.open = true; return true; })()`);
  await sleep(400);
  txt = await b.text();
  rep.check("el resumen desplegado muestra número, fecha, modalidad, estado, saldo y garantía", /Servicio n\.º/.test(txt) && /Modalidad/.test(txt) && /Saldo por pagar/.test(txt) && txt.includes(cop(base)) && /Garantía/.test(txt));
  const hist = await b.eval(`(() => { const ol = document.querySelector('ol[aria-label="Historial del servicio"]'); return ol ? ol.innerText : ''; })()`);
  rep.check("historial: siguiente etapa en gris, estado actual en naranja y anteriores en verde (con texto)", /Siguiente/i.test(hist) && /Etapa actual/i.test(hist) && /Completado/i.test(hist), hist.slice(0, 160));
  rep.check("historial: colores reales (verde completado, naranja actual)", (await b.eval(`(() => { const ol = document.querySelector('ol[aria-label="Historial del servicio"]'); return !!ol.querySelector('.bg-ok') && !!ol.querySelector('.bg-brand'); })()`)) === true);
  rep.check("móvil: sin desbordes en el seguimiento", await noOverflow(b));
  await shot(b, "2-seguimiento-movil");

  // ---------------------------------------------------------------- 5 · técnico: estado económico y registro del ANTICIPO
  await staff("tech");
  await b.viewport(1440, 900);
  await b.goto(`/b/tickets/${t}`, 2000);
  txt = await b.text();
  rep.check("técnico: «Cotización aprobada, todavía sin pago» y la próxima acción es esperar el pago", /Cotización aprobada, todavía sin pago/.test(txt) && /Esperando el pago de la cotización/.test(txt));
  await sleep(1200);
  await b.clickText(`Registrar pago manual · ${cop(dep)}`, "body");
  await sleep(4000);
  rep.check("anticipo registrado: modalidad, importe sin descuento y servicio habilitado", q(`select installment || '|' || amount::int || '|' || discount_amount::int from payments where quote_id = '${quote}' and status = 'approved'`) === `deposit|${dep}|0` && q(`select status from tickets where id = '${t}'`) === "in_service");
  await b.goto(`/b/tickets/${t}`, 2000);
  txt = await b.text();
  rep.check("técnico: «Pago parcial confirmado» con recibido y saldo", /Pago parcial confirmado/.test(txt) && txt.includes(`Recibido: ${cop(dep)}`) && txt.includes(`Saldo pendiente: ${cop(base - dep)}`));
  await shot(b, "3-panel-tecnico");
  await staff("owner");
  await b.goto("/b/tickets", 2000);
  rep.check("SUPERADMIN: la lista distingue «Anticipo · saldo»", (await b.text()).includes(`Anticipo · saldo ${cop(base - dep)}`));

  // ---------------------------------------------------------------- 6 · cliente: anticipo confirmado; el saldo se habilita al final
  await clientLogin(b, state.client);
  await b.viewport(390, 844, true);
  await b.goto(`/c/tickets/${t}`, 2500);
  txt = await b.text();
  rep.check("cliente: «Anticipo confirmado» con saldo; sin botón de saldo mientras se repara", /Anticipo confirmado/.test(txt) && txt.includes(cop(base - dep)) && !/Pagar saldo restante ·/.test(txt));
  q(`update tickets set status = 'ready' where id = '${t}'`);
  await b.goto(`/c/tickets/${t}`, 2500);
  txt = await b.text();
  rep.check("con el equipo listo: «Pagar saldo restante» con el importe exacto (sin volver a descontar nada)", txt.includes(`Pagar saldo restante · ${cop(base - dep)}`));
  await shot(b, "4-saldo-movil");

  // ---------------------------------------------------------------- 7 · saldo en el local → liquidada; avisos sin duplicados
  await staff("tech");
  await b.viewport(1440, 900);
  await b.goto(`/b/tickets/${t}`, 2000);
  await sleep(1200);
  await b.clickText(`Registrar pago manual · ${cop(base - dep)}`, "body");
  await sleep(4000);
  rep.check("saldo pagado: cotización liquidada (pagado = base, sin descuento)", q(`select (paid_at is not null) || '|' || amount_paid::int || '|' || early_discount::int from quotes where id = '${quote}'`) === `true|${base}|0`);
  rep.check("avisos al cliente: «¡Pago confirmado!» (anticipo) y «Saldo pagado», una vez cada uno", q(`select count(*) filter (where title = '¡Pago confirmado!') || '|' || count(*) filter (where title = 'Saldo pagado') from notifications where recipient_id = '${profile}' and entity_id = '${t}'`) === "1|1");
  rep.check("avisos al SUPERADMIN por cada pago de la cotización, sin duplicados", q(`select count(*) from notifications n join profiles p on p.id = n.recipient_id where p.role = 'superadmin' and n.type = 'payment.quote' and n.entity_id = '${t}'`) === String(2 * Number(q(`select count(*) from profiles where role = 'superadmin' and is_active`))));

  // ---------------------------------------------------------------- 8 · instalación PWA (sin simular nada)
  await clientLogin(b, state.client);
  await b.goto("/c/mas", 2000);
  txt = await b.text();
  rep.check("«Instalar TechnoUltra» visible en «Más», sin fingir una instalación", /Instalar TechnoUltra/.test(txt) && (/Instalar aplicación/.test(txt) || /Añadir a pantalla de inicio|menú ⋮|instalada/.test(txt)) && !/Instalando TechnoUltra/.test(txt));
  rep.check("sin errores de JavaScript", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
}
