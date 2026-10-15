// Solicitud de servicio: local o domicilio con tarifa de la zona, equipos y direcciones nuevos desde el mismo formulario, cotización con el domicilio como
// concepto aparte, navegación documental con salida clara y diseño en escritorio / tableta / móvil. Recorridos A–E del encargo.
import { clientLogin, staffLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Solicitud: local/domicilio con tarifa, equipos y direcciones nuevos, cotización con domicilio y navegación de documentos (PC, tableta y móvil)";

const q = (sql) => psql(sql);
const SLUG = "diagnostico-basico"; // admite local y domicilio y requiere equipo
const RADIO = (m) => `input[name=modality][value=${m}]`;
// Datos únicos por corrida: la deduplicación (correcta) reutiliza un registro idéntico creado hace menos de 10 minutos.
const RUN = Date.now().toString(36).slice(-5);
const MODEL = `LaserJet E2E-21 ${RUN}`;

export async function run({ b, rep, state, save }) {
  const profile = q(`select id from profiles where email = '${state.client.email}'`);
  const customer = q(`select id from customers where profile_id = '${profile}'`);
  const svc = q(`select id from services where slug = '${SLUG}'`);
  // Zona SIN tarifa de domicilio (Yumbo = 0) para comprobar que no se inventa un valor; Cali y Palmira conservan su tarifa.
  q(`update coverage_areas set home_fee = 15000 where dane_code = '76001'; update coverage_areas set home_fee = 25000 where dane_code = '76520'; update coverage_areas set home_fee = 0 where dane_code = '76892'`);
  const count = (sql) => Number(q(sql));
  const eqBefore = count(`select count(*) from equipment where customer_id = '${customer}'`);
  const adBefore = count(`select count(*) from addresses where customer_id = '${customer}' and deleted_at is null`);
  const text = async () => (await b.text()).replace(/\s+/g, " ");
  const panel = () => b.eval(`(() => { const p = document.querySelector('[data-delivery]'); return p ? { kind: p.dataset.delivery, text: p.innerText.replace(/\\s+/g, ' ') } : null; })()`);
  // La primera carga tras arrancar el servidor puede tardar en hidratar: se reintenta el inicio de sesión (como haría una persona).
  const login = async () => {
    for (let i = 0; i < 3; i++) {
      await clientLogin(b, state.client);
      if (!(await b.path()).startsWith("/login")) return;
      await sleep(2500);
    }
  };
  const form = async (path) => {
    await login();
    await b.viewport(1440, 900);
    await b.goto(path, 2200);
    await b.waitHydrated(RADIO("store"));
  };
  const req = (slug = SLUG) => `/c/solicitar/${slug}`;
  const clickBtn = (label) => b.eval(`(() => { const x = [...document.querySelectorAll('button')].find((y) => y.innerText.trim() === ${JSON.stringify(label)}); if (!x) return false; x.click(); return true; })()`);
  const waitFor = async (fn, ms = 15000) => {
    for (let t = 0; t < ms / 400; t++) {
      if (await fn()) return true;
      await sleep(400);
    }
    return false;
  };

  // ================================================================ A · servicio en el local + equipo NUEVO
  await form(req());
  const opts = await b.eval(`[...document.querySelectorAll('input[name=modality]')].map((x) => ({ v: x.value, d: x.disabled, c: x.checked }))`);
  rep.check("el selector ofrece «Llevar al local» y «Servicio a domicilio» cuando el servicio admite ambos", opts.some((o) => o.v === "store" && !o.d) && opts.some((o) => o.v === "home" && !o.d), JSON.stringify(opts));
  rep.check("por defecto queda «Llevar al local» y no se pide ningún cargo de domicilio", opts.find((o) => o.c)?.v === "store" && (await panel()) === null);
  await clickBtn("Registrar uno nuevo");
  await b.waitHydrated("[name=eq_brand]");
  await b.fill("eq_type", "printer");
  await b.fill("eq_brand", "HP");
  await b.fill("eq_model", MODEL);
  const clicks = await b.eval(`(() => { const x = [...document.querySelectorAll('button')].find((y) => y.innerText.trim() === 'Guardar equipo y seleccionarlo'); x.click(); x.click(); return true; })()`);
  rep.check("registrar un equipo nuevo desde la solicitud (con doble clic) crea UNO solo, para este cliente", clicks && (await waitFor(() => count(`select count(*) from equipment where customer_id = '${customer}'`) === eqBefore + 1)) && (await sleep(1500), count(`select count(*) from equipment where customer_id = '${customer}' and model = '${MODEL}'`)) === 1);
  rep.check("el equipo nuevo queda seleccionado en la solicitud sin reiniciar el formulario", await waitFor(async () => new RegExp(`HP ${MODEL}`).test(await b.eval(`document.querySelector('select[name=equipmentId]')?.selectedOptions[0]?.innerText ?? ''`))));
  const newEq = q(`select id from equipment where customer_id = '${customer}' and model = '${MODEL}'`);
  await b.fill("problem", "La impresora no imprime desde el computador (E2E 21, local).");
  await b.submit("problem");
  const okA = await b.waitPath((p) => p.startsWith("/c/solicitar/listo"), 25000);
  rep.check("recorrido A: la solicitud en el local se envía y confirma", okA.startsWith("/c/solicitar/listo"), okA);
  const codeA = new URL(okA, "http://x").searchParams.get("c");
  const rA = q(`select modality || '|' || (equipment_id = '${newEq}') || '|' || (address_id is not null) from service_requests where code = '${codeA}'`);
  rep.check("la solicitud conserva el equipo NUEVO elegido, la modalidad y una dirección", /^store\|true\|/.test(rA), rA);
  const ticketA = q(`select t.id from tickets t join service_requests r on r.id = t.service_request_id where r.code = '${codeA}'`);
  rep.check("se crea el ticket vinculado a esa solicitud, equipo y modalidad", /^[0-9a-f-]{36}$/.test(ticketA) && q(`select equipment_id = '${newEq}' and modality = 'store' from tickets where id = '${ticketA}'`) === "t");

  // ================================================================ B · domicilio con tarifa configurada + dirección NUEVA
  await b.goto(req(), 2200);
  await b.waitHydrated(RADIO("home"));
  await b.click(RADIO("home"));
  await sleep(500);
  let p = await panel();
  rep.check("al elegir domicilio se muestra el valor de la zona de la dirección (Cali $15.000) como cargo aparte, antes de enviar", p?.kind === "fee" && /Cali: \$15\.000/.test(p.text) && /aparte/.test(p.text) && /no está incluido/.test(p.text), JSON.stringify(p));
  await clickBtn("Registrar una nueva");
  await b.waitHydrated("[name=ad_line1]");
  await b.fill("ad_label", "Oficina");
  await b.fill("ad_dane", "76520");
  await b.fill("ad_line1", `Carrera 28 # 30-15 ${RUN}`);
  await b.fill("ad_notes", "Oficina 302, portería");
  await clickBtn("Guardar dirección y seleccionarla");
  rep.check("registrar una dirección nueva (Oficina en Palmira) la crea sin reemplazar la anterior y queda seleccionada", (await waitFor(() => count(`select count(*) from addresses where customer_id = '${customer}' and deleted_at is null`) === adBefore + 1)) && q(`select label || '|' || city_name || '|' || coalesce(notes, '') from addresses where customer_id = '${customer}' and line1 = 'Carrera 28 # 30-15 ${RUN}'`) === "Oficina|Palmira|Oficina 302, portería");
  await sleep(800);
  p = await panel();
  rep.check("la tarifa se actualiza con la zona de la dirección nueva (Palmira $25.000)", p?.kind === "fee" && /Palmira: \$25\.000/.test(p.text), JSON.stringify(p));
  // cambio de modalidad después de llenar el formulario: se conserva lo escrito
  await b.fill("problem", "El computador no enciende (E2E 21, domicilio).");
  await b.click(RADIO("store"));
  await sleep(400);
  rep.check("cambiar de modalidad conserva lo ya escrito y el cargo de domicilio desaparece en el local", (await b.eval(`document.querySelector('[name=problem]').value`)).includes("E2E 21, domicilio") && (await panel()) === null);
  await b.click(RADIO("home"));
  await sleep(400);
  rep.check("al volver a domicilio se recupera el valor de la zona seleccionada", (await panel())?.kind === "fee");

  // zona SIN tarifa configurada (Yumbo = 0) y dirección FUERA de cobertura
  await b.waitHydrated("select[name=addressId]");
  await clickBtn("Registrar una nueva");
  await b.waitHydrated("[name=ad_line1]");
  await b.fill("ad_label", "Sede Yumbo");
  await b.fill("ad_dane", "76892");
  await b.fill("ad_line1", `Calle 10 # 5-20 ${RUN} (E2E 21)`);
  await clickBtn("Guardar dirección y seleccionarla");
  await waitFor(async () => (await panel())?.kind === "fee_missing");
  p = await panel();
  rep.check("zona sin tarifa (Yumbo): NO inventa un valor; dice que se confirmará antes de aceptar la cotización", p?.kind === "fee_missing" && /confirmaremos antes de que aceptes/.test(p.text) && !/\$\s?0|gratis/i.test(p.text), JSON.stringify(p));
  await clickBtn("Registrar una nueva");
  await b.waitHydrated("[name=ad_line1]");
  await b.fill("ad_label", "Casa de campo");
  await b.fill("ad_dane", "other");
  await sleep(300);
  await b.fill("ad_otherCity", "Bogotá");
  await b.fill("ad_otherDept", "Cundinamarca");
  await b.fill("ad_line1", `Calle 100 # 15-20 ${RUN} (E2E 21)`);
  await clickBtn("Guardar dirección y seleccionarla");
  await waitFor(async () => (await panel())?.kind === "uncovered");
  p = await panel();
  rep.check("dirección fuera de cobertura: se puede registrar, pero NO habilita domicilio (se explica y no se deja enviar)", p?.kind === "uncovered" && /fuera de la cobertura/.test(p.text), JSON.stringify(p));
  await b.submit("problem");
  await sleep(1500);
  rep.check("el envío queda bloqueado con un mensaje claro", (await b.path()).startsWith("/c/solicitar/") && !(await b.path()).startsWith("/c/solicitar/listo") && /fuera de la cobertura/.test(await text()));
  q(`do $$ begin insert into service_requests (customer_id, service_id, modality, equipment_id, address_id, problem_description) values ('${customer}', '${svc}', 'home', '${newEq}', (select id from addresses where customer_id = '${customer}' and line1 like 'Calle 100 # 15-20%'), 'forzada E2E 21'); exception when others then null; end $$`);
  rep.check("el servidor también lo impide: una solicitud a domicilio con esa dirección es rechazada por la base de datos", count(`select count(*) from service_requests where problem_description = 'forzada E2E 21'`) === 0);

  // ================================================================ C · varias ubicaciones: cada solicitud conserva SU dirección
  await b.goto(req(), 2200);
  await b.waitHydrated(RADIO("home"));
  await b.click(RADIO("home"));
  await sleep(300);
  const officeId = q(`select id from addresses where customer_id = '${customer}' and label = 'Oficina' and deleted_at is null limit 1`);
  await b.fill("addressId", officeId);
  await sleep(400);
  await b.fill("problem", "Visita a la oficina (E2E 21, Oficina).");
  await b.submit("problem");
  const okB = await b.waitPath((pp) => pp.startsWith("/c/solicitar/listo"), 25000);
  const codeB = new URL(okB, "http://x").searchParams.get("c");
  rep.check("recorrido B: solicitud a domicilio en la Oficina enviada; guarda esa dirección y la modalidad", okB.startsWith("/c/solicitar/listo") && q(`select modality || '|' || (address_id = '${officeId}') from service_requests where code = '${codeB}'`) === "home|true");
  const snap = q(`select (service_snapshot->'delivery'->>'fee') || '|' || (service_snapshot->'delivery'->>'city') || '|' || (service_snapshot->'delivery'->>'fee_configured') from service_requests where code = '${codeB}'`);
  rep.check("la solicitud registra el valor estimado del domicilio calculado por el servidor (Palmira $25.000)", snap === "25000|Palmira|true", snap);
  await b.goto(req(), 2200);
  await b.waitHydrated(RADIO("home"));
  await b.click(RADIO("home"));
  const casaId = q(`select id from addresses where customer_id = '${customer}' and label = 'Casa' and deleted_at is null limit 1`);
  await b.fill("addressId", casaId);
  await b.fill("problem", "Visita a la casa (E2E 21, Casa).");
  await b.submit("problem");
  const okC = await b.waitPath((pp) => pp.startsWith("/c/solicitar/listo"), 25000);
  const codeC = new URL(okC, "http://x").searchParams.get("c");
  rep.check("recorrido C: otra solicitud con la dirección de la Casa conserva la suya (y la de la Oficina no cambió)", q(`select (address_id = '${casaId}') from service_requests where code = '${codeC}'`) === "t" && q(`select (address_id = '${officeId}') from service_requests where code = '${codeB}'`) === "t");
  rep.check("el cliente conserva todas sus direcciones (ninguna fue reemplazada) y sus equipos", count(`select count(*) from addresses where customer_id = '${customer}' and deleted_at is null`) >= adBefore + 3 && count(`select count(*) from equipment where customer_id = '${customer}'`) === eqBefore + 1);
  rep.check("un cliente NO puede registrar equipos ni direcciones a nombre de otra cuenta: todos los registros nuevos son suyos", count(`select count(*) from equipment where model = '${MODEL}' and customer_id <> '${customer}'`) === 0 && count(`select count(*) from addresses where line1 like '%(E2E 21)' and customer_id <> '${customer}'`) === 0);
  const ticketB = q(`select t.id from tickets t join service_requests r on r.id = t.service_request_id where r.code = '${codeB}'`);
  const reqY = q(`select id from addresses where customer_id = '${customer}' and label = 'Sede Yumbo' and deleted_at is null limit 1`);

  // ================================================================ Cotización con el domicilio como concepto aparte (personal)
  q(`update tickets set status = 'diagnosing' where id = '${ticketB}'`);
  await staffLogin(b, state.owner).then((r) => {
    state.owner.secret = r.secret;
    save();
  });
  await b.goto(`/b/tickets/${ticketB}`, 2500);
  await b.waitHydrated("form [name=ticketId]");
  await b.clickText("Crear cotización", "body");
  await waitFor(() => count(`select count(*) from quotes where ticket_id = '${ticketB}'`) === 1);
  const quote = q(`select id from quotes where ticket_id = '${ticketB}'`);
  const dq = q(`select delivery_fee || '|' || (delivery_snapshot->>'city') || '|' || (delivery_snapshot->>'modality') from quotes where id = '${quote}'`);
  rep.check("al crear la cotización de un ticket a domicilio, el domicilio entra solo como concepto aparte con el valor de la zona (Palmira $25.000)", dq === "25000.00|Palmira|home", dq);
  q(`insert into quote_items (quote_id, position, kind, description, qty, unit_price, concept, warranty_days) values ('${quote}', 1, 'custom', 'Mano de obra E2E 21', 1, 60000, 'labor', 0)`);
  const tot = q(`select subtotal || '|' || delivery_fee || '|' || total from quotes where id = '${quote}'`);
  rep.check("el total lo calcula el servidor: servicio $60.000 + domicilio $25.000 = $85.000 (sin cobrar el domicilio dos veces)", tot === "60000.00|25000.00|85000.00", tot);
  rep.check("el domicilio no se incluyó en el precio del servicio (línea de la mano de obra intacta)", q(`select unit_price from quote_items where quote_id = '${quote}'`) === "60000.00");
  await b.goto(`/b/tickets/${ticketB}`, 2500);
  rep.check("el personal ve la línea «Domicilio · Palmira» separada en la cotización", /Domicilio · Palmira/.test(await text()) || /Domicilio/.test(await text()));
  await b.waitHydrated("form [name=quoteId]");
  await b.clickText("Enviar al cliente", "body");
  await waitFor(() => q(`select status from quotes where id = '${quote}'`) === "sent");
  rep.check("la cotización con domicilio se puede enviar al cliente", q(`select status from quotes where id = '${quote}'`) === "sent");

  // zona sin tarifa (Yumbo): no se cobra un domicilio inventado y no se envía sin él salvo cortesía explícita
  await login();
  await b.viewport(1440, 900);
  await b.goto(req(), 2200);
  await b.waitHydrated(RADIO("home"));
  await b.click(RADIO("home"));
  await b.fill("addressId", reqY);
  await b.fill("problem", "Visita a Yumbo (E2E 21, sin tarifa).");
  await b.submit("problem");
  const okY = await b.waitPath((pp) => pp.startsWith("/c/solicitar/listo"), 25000);
  const codeY = new URL(okY, "http://x").searchParams.get("c");
  const snapY = q(`select coalesce(service_snapshot->'delivery'->>'fee', 'NULL') || '|' || (service_snapshot->'delivery'->>'fee_configured') from service_requests where code = '${codeY}'`);
  rep.check("la solicitud en una zona sin tarifa registra «sin tarifa» (no un valor inventado)", snapY === "NULL|false", snapY);
  const ticketY = q(`select t.id from tickets t join service_requests r on r.id = t.service_request_id where r.code = '${codeY}'`);
  q(`update tickets set status = 'diagnosing' where id = '${ticketY}'`);
  await staffLogin(b, state.owner);
  await b.goto(`/b/tickets/${ticketY}`, 2500);
  await b.waitHydrated("form [name=ticketId]");
  await b.clickText("Crear cotización", "body");
  await waitFor(() => count(`select count(*) from quotes where ticket_id = '${ticketY}'`) === 1);
  const quoteY = q(`select id from quotes where ticket_id = '${ticketY}'`);
  rep.check("sin tarifa en la zona: la cotización NO lleva domicilio (no se cobra nada inventado ni «gratis» en silencio)", q(`select delivery_fee from quotes where id = '${quoteY}'`) === "0.00");
  q(`insert into quote_items (quote_id, position, kind, description, qty, unit_price, concept, warranty_days) values ('${quoteY}', 1, 'custom', 'Mano de obra E2E 21 Yumbo', 1, 60000, 'labor', 0)`);
  await b.goto(`/b/tickets/${ticketY}`, 2500);
  rep.check("el personal ve el aviso de que falta la tarifa de domicilio", /sin domicilio en la cotización/i.test(await text()) && /Cobertura/.test(await text()));
  await b.waitHydrated("form [name=quoteId]");
  await b.clickText("Enviar al cliente", "body");
  await sleep(2500);
  rep.check("no se envía una cotización a domicilio sin el domicilio mientras no haya cortesía explícita", q(`select status from quotes where id = '${quoteY}'`) === "draft" && /no incluye el domicilio/.test(await text()));
  await b.check("waiveDelivery");
  await b.clickText("Enviar al cliente", "body");
  await waitFor(() => q(`select status from quotes where id = '${quoteY}'`) === "sent");
  rep.check("con la cortesía explícita sí se envía (sin domicilio)", q(`select status || '|' || delivery_fee from quotes where id = '${quoteY}'`) === "sent|0.00");

  // ================================================================ D · navegación documental
  await login();
  await b.viewport(1440, 900);
  await b.goto(`/c/tickets/${ticketB}`, 2500);
  const quotePage = `/c/tickets/${ticketB}/cotizacion`;
  await b.goto(quotePage, 2200);
  rep.check("la cotización del cliente muestra el domicilio como línea separada y el total correcto", /Domicilio/.test(await text()) && /\$85\.000/.test(await text()));
  await b.clickText("Ver cotización en PDF", "body");
  const viewer = await b.waitPath((pp) => pp.includes("/ver"), 15000);
  rep.check("recorrido D: «Ver cotización en PDF» abre el visor DENTRO de la app con el origen en la URL", /^\/c\/documentos\/[0-9a-f-]{36}\/ver\?from=/.test(viewer), viewer);
  await sleep(1200);
  const v = await b.eval(`(() => { const f = document.querySelector('iframe'); const back = [...document.querySelectorAll('a')].filter((a) => /Volver/.test(a.innerText)).map((a) => ({ t: a.innerText.trim(), h: a.getAttribute('href') })); return { iframe: f ? f.getAttribute('src') : null, back, dl: !!document.querySelector('a[href*="descargar=1"]'), tab: !!document.querySelector('a[target=_blank]') }; })()`);
  rep.check("el visor trae el PDF incrustado, «Volver a la cotización» (al origen real), descarga y abrir en pestaña nueva", /^\/documentos\//.test(v.iframe ?? "") && v.back.some((x) => /Volver a la cotización/.test(x.t) && x.h === quotePage) && v.dl && v.tab, JSON.stringify(v));
  await b.eval(`(() => { [...document.querySelectorAll('a')].find((a) => /Volver a la cotización/.test(a.innerText)).click(); return true; })()`);
  rep.check("la flecha regresa a la cotización (contexto real), no a Inicio", (await b.waitPath((pp) => pp === quotePage, 10000)) === quotePage);
  await sleep(1500);
  await b.eval(`(() => { [...document.querySelectorAll('a')].find((a) => /Volver a mi servicio/.test(a.innerText)).click(); return true; })()`);
  rep.check("desde la cotización se vuelve al ticket", (await b.waitPath((pp) => pp === `/c/tickets/${ticketB}`, 10000)) === `/c/tickets/${ticketB}`);
  const docQ = q(`select id from documents where ticket_id = '${ticketB}' and doc_type = 'quote' order by created_at desc limit 1`);
  await b.goto(`/c/documentos/${docQ}/ver`, 2200); // acceso directo (sin historial ni origen)
  const direct = await b.eval(`[...document.querySelectorAll('a')].filter((a) => /Volver/.test(a.innerText)).map((a) => a.getAttribute('href'))`);
  rep.check("acceso directo por URL (sin historial): la salida existe y lleva a la ficha del documento", direct.includes(`/c/documentos/${docQ}`), JSON.stringify(direct));
  await b.goto(`/c/documentos/${docQ}`, 2000);
  rep.check("la ficha del documento vuelve al ticket del que proviene cuando no hay origen", (await b.eval(`[...document.querySelectorAll('a')].some((a) => /Volver a mi servicio/.test(a.innerText) && a.getAttribute('href') === '/c/tickets/${ticketB}')`)));
  await b.goto(`/c/documentos/${docQ}?from=${encodeURIComponent("https://evil.example/x")}`, 2000);
  rep.check("un origen malicioso en la URL se ignora (sin redirección abierta)", await b.eval(`![...document.querySelectorAll('a')].some((a) => /evil\\.example/.test(a.getAttribute('href') || ''))`));
  const raw = await b.eval(`(async () => { const r = await fetch('/documentos/${docQ}'); return { ok: r.ok, type: r.headers.get('content-type'), xfo: r.headers.get('x-frame-options'), csp: r.headers.get('content-security-policy') }; })()`);
  rep.check("el PDF sigue entregándose con permisos (application/pdf), embebible SOLO por el propio sitio", raw.ok && raw.type === "application/pdf" && raw.xfo === "SAMEORIGIN" && /frame-ancestors 'self'/.test(raw.csp ?? ""), JSON.stringify(raw));
  const page = await b.eval(`(async () => { const r = await fetch('/c/documentos'); return { xfo: r.headers.get('x-frame-options'), csp: r.headers.get('content-security-policy') }; })()`);
  rep.check("el resto de la app sigue sin poder incrustarse (DENY / frame-ancestors 'none')", page.xfo === "DENY" && /frame-ancestors 'none'/.test(page.csp ?? ""), JSON.stringify(page));
  // personal: visor con regreso al ticket
  await staffLogin(b, state.owner);
  await b.goto(`/b/tickets/${ticketB}`, 2500);
  const staffLink = await b.eval(`(() => { const a = [...document.querySelectorAll('a')].find((x) => /\\/b\\/documentos\\//.test(x.getAttribute('href') || '')); return a ? { h: a.getAttribute('href'), blank: a.target === '_blank' } : null; })()`);
  rep.check("en el ticket del personal los documentos abren el visor interno (sin pestaña suelta) con el origen", staffLink && /^\/b\/documentos\/[0-9a-f-]{36}\?from=/.test(staffLink.h) && staffLink.blank === false, JSON.stringify(staffLink));
  await b.goto(staffLink.h, 2200);
  const staffBack = await b.eval(`[...document.querySelectorAll('a')].filter((a) => /Volver al ticket/.test(a.innerText)).map((a) => a.getAttribute('href'))`);
  rep.check("el visor del personal ofrece «Volver al ticket» y el PDF incrustado", staffBack.includes(`/b/tickets/${ticketB}`) && (await b.eval(`!!document.querySelector('iframe[src^="/documentos/"]')`)));

  // «Volver» sin perder filtros: la lista con su búsqueda y estado vuelve tal cual
  await staffLogin(b, state.owner);
  const listUrl = `/b/tickets?estado=all&q=${encodeURIComponent("E2E-21")}`;
  await b.goto(listUrl, 2200);
  const row = await b.eval(`(() => { const a = [...document.querySelectorAll('a')].find((x) => (x.getAttribute('href') || '').startsWith('/b/tickets/') && (x.getAttribute('href') || '').includes('?from=')); return a ? a.getAttribute('href') : null; })()`);
  rep.check("la lista de tickets del personal enlaza cada ticket con su búsqueda y filtros de origen", Boolean(row) && decodeURIComponent(row).includes("estado=all") && decodeURIComponent(row).includes("q=E2E-21"), String(row));
  await b.goto(row, 2200);
  const backHref = await b.eval(`[...document.querySelectorAll('a')].filter((a) => /Volver a tickets/.test(a.innerText)).map((a) => a.getAttribute('href'))[0]`);
  rep.check("«Volver a tickets» regresa a la lista CON la búsqueda y el estado (no a la lista vacía)", backHref === listUrl, String(backHref));

  // ================================================================ E · responsive: tableta y móvil conservados, escritorio aprovecha el ancho
  await login();
  const geometry = async () => b.eval(`(() => { const a = document.querySelector('[data-request-summary]'); const f = document.querySelector('form[data-request-form]'); const d = document.documentElement; if (!a || !f) return null; const ra = a.getBoundingClientRect(); const rf = f.getBoundingClientRect(); return { sideBySide: rf.left >= ra.right - 1 && Math.abs(rf.top - ra.top) < 120, aside: Math.round(ra.width), form: Math.round(rf.width), over: d.scrollWidth - d.clientWidth }; })()`);
  await b.viewport(1440, 900);
  await b.goto(req(), 2200);
  const pc = await geometry();
  rep.check("escritorio: resumen del servicio y formulario en dos columnas, sin desbordes", pc?.sideBySide === true && pc.over <= 1 && pc.form > 520, JSON.stringify(pc));
  await b.viewport(820, 1100);
  await b.goto(req(), 2200);
  const tab = await geometry();
  rep.check("tableta: una columna sin desbordes", tab && tab.over <= 1, JSON.stringify(tab));
  await b.viewport(390, 844, true);
  await b.goto(req(), 2200);
  const mov = await geometry();
  const movCards = await b.eval(`[...document.querySelectorAll('input[name=modality]')].length`);
  rep.check("móvil: el orden y la composición se conservan (resumen arriba, formulario debajo, una columna) sin desbordes", mov && mov.sideBySide === false && mov.over <= 1 && movCards >= 2, JSON.stringify(mov));
  await b.goto(`/c/documentos/${docQ}/ver`, 2200);
  rep.check("móvil: el visor de documentos no desborda y mantiene la salida", (await b.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`)) <= 1 && (await b.eval(`[...document.querySelectorAll('a')].some((a) => /Volver/.test(a.innerText))`)));
  await b.viewport(1440, 900);
}
