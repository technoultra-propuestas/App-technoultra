// Recepción del equipo: fotografías PRIMERO (sin guardar antes), cámara y galería por foto, miniaturas, reintento, cambio y retiro,
// persistencia tras recargar, estado del equipo unificado, resumen y «Confirmar recepción» (exige las 4 vistas) + plazo de contacto configurable.
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { clientLogin, must, staffLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Recepción con fotografías primero, confirmación y mensaje de pago con plazo configurable";

const PHOTO = resolve("tests/e2e/fixtures/foto-prueba.png");
const BAD = resolve("tests/e2e/.out/no-es-foto.txt");
const q = (sql) => psql(sql);
const shot = async (b, name) => {
  await b.eval("document.querySelector('#fotos-recepcion')?.scrollIntoView({ block: 'start' })");
  await sleep(500);
  return b.screenshot(resolve("tests/e2e/.out", `recepcion-${name}.png`));
};
const noOverflow = (b) => b.eval("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1");

export async function run({ b, rep, state, save }) {
  writeFileSync(BAD, "esto no es una imagen");
  const profile = q(`select id from profiles where email = '${state.client.email}'`);
  const customer = q(`select id from customers where profile_id = '${profile}'`);
  q(`insert into services (slug, name, kind, base_price, allowed_modalities, is_diagnostic_fee, requires_equipment, allow_online_payment) values ('diagnostico-tecnico-e2e', 'Diagnóstico técnico', 'technical', 39900, '{store,home,pickup}', true, false, true) on conflict (slug) do nothing`);
  const svc = q(`select id from services where slug = 'diagnostico-tecnico-e2e'`);
  const t = q(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ('${customer}', '${svc}', 'store', 'No enciende (E2E 17).', '${state.techId}') returning id`).split("\n")[0];
  const ev = (slot) => Number(q(`select count(*) from evidence where ticket_id = '${t}' and stage = 'reception' and slot = '${slot}' and deleted_at is null`));
  const upload = async (slot, file = PHOTO, kind = ":not([capture])") => {
    const sel = `li[data-slot=${slot}] input[type=file]${kind}`;
    await b.waitHydrated(sel);
    return b.setFiles(sel, [file], 0);
  };

  await staffLogin(b, state.tech).then((r) => {
    state.tech.secret = r.secret;
    save();
  });
  await b.viewport(1440, 900);
  await b.goto(`/b/tickets/${t}`, 2200);
  let txt = await b.text();

  // ---------------------------------------------------------------- 1 · estructura: fotos primero
  const order = await b.eval(`(() => { const t = document.body.innerText; return [t.indexOf('Fotografías del equipo'), t.indexOf('Motivo de ingreso')]; })()`);
  rep.check("«Fotografías del equipo» aparece ANTES que el motivo de ingreso, con «0 de 4 fotos»", order[0] > -1 && order[1] > order[0] && /0 de 4 fotos/.test(txt), JSON.stringify(order));
  const labels = ["Vista frontal y pantalla", "Parte posterior o tapa", "Laterales y puertos", "Daños visibles o vista adicional"];
  rep.check("cuatro espacios con su etiqueta y cámara/galería por foto", labels.every((l) => txt.includes(l)) && (await b.eval(`document.querySelectorAll('li[data-slot=front] input[type=file]').length === 2 && !!document.querySelector('li[data-slot=front] input[capture]') && !!document.querySelector('li[data-slot=front] input[type=file]:not([capture])')`)) === true);
  rep.check("escritorio: cuadrícula de 4 columnas y sin desbordes", (await b.eval(`getComputedStyle(document.querySelector('#fotos-recepcion ul')).gridTemplateColumns.split(' ').length`)) === 4 && (await noOverflow(b)));
  rep.check("«Confirmar recepción» está deshabilitada y explica qué fotos faltan, con enlace a la sección", /Faltan 4 fotos obligatorias/.test(txt) && (await b.eval(`[...document.querySelectorAll('button[type=submit]')].find((x) => /Confirmar recepción/.test(x.innerText))?.disabled`)) === true && /Ir a las fotografías/.test(txt));
  rep.check("«Estado del equipo al recibirlo» con las casillas de daños (incluye «Otros daños») y un único campo de detalles; ya no hay «Estado físico» ni «Observaciones» sueltos", /Estado del equipo al recibirlo/.test(txt) && ["Rayones", "Golpes", "Pantalla rota", "Bisagra floja", "Teclas faltantes", "Carcasa partida", "Otros daños"].every((d) => txt.includes(d)) && /Otros daños, detalles o condiciones importantes/.test(txt) && !/Estado físico/.test(txt) && !/\bObservaciones\b/.test(txt));
  rep.check("«Accesorios recibidos» y «Motivo de ingreso» siguen como secciones independientes", /Accesorios recibidos/.test(txt) && /Motivo de ingreso/.test(txt));
  await shot(b, "1-escritorio-sin-fotos");

  // ---------------------------------------------------------------- 2 · subir SIN guardar antes; reintento y fotos que sobreviven
  const ok = await upload("front");
  for (let i = 0; i < 50 && ev("front") === 0; i++) await sleep(500);
  rep.check("la foto frontal se sube a Cloudinary y queda registrada SIN guardar la recepción", ok && ev("front") === 1 && q(`select count(*) from receptions where ticket_id = '${t}'`) === "0");
  await must(b, /1 de 4 fotos/, 15000);
  rep.check("miniatura y marca «Foto lista»; progreso «1 de 4 fotos»", (await b.eval(`!!document.querySelector('li[data-slot=front][data-done="1"] img')`)) === true && /Foto lista/.test(await b.text()));
  await upload("back", BAD);
  await sleep(1500);
  txt = await b.text();
  rep.check("un archivo inválido falla solo en su espacio (con motivo y «Reintentar») y NO afecta a la foto ya guardada", /Formato no permitido/.test(txt) && /Reintentar/.test(txt) && ev("back") === 0 && ev("front") === 1);
  await upload("back");
  for (let i = 0; i < 50 && ev("back") === 0; i++) await sleep(500);
  rep.check("subir una foto válida en el mismo espacio recupera el error", ev("back") === 1);
  // cambiar la frontal: la nueva reemplaza a la anterior (no se acumulan)
  await upload("front");
  for (let i = 0; i < 40 && Number(q(`select count(*) from evidence where ticket_id = '${t}' and slot = 'front'`)) < 2; i++) await sleep(500);
  await sleep(2000);
  rep.check("cambiar una foto retira la anterior: sigue habiendo UNA activa en ese espacio", ev("front") === 1 && Number(q(`select count(*) from evidence where ticket_id = '${t}' and slot = 'front'`)) === 2);

  // ---------------------------------------------------------------- 3 · recarga: fotos y borrador del formulario
  await b.waitHydrated("form [name=reason]");
  await b.fill("reason", "No enciende; cae al piso (E2E 17).");
  // casillas de grupo: cada una se recuerda por separado (daños: Rayones y Bisagra floja; accesorio: Cargador)
  await b.eval(`(() => { for (const [n, v] of [['damage', 'Rayones'], ['damage', 'Bisagra floja'], ['accessories', 'Cargador']]) { const c = [...document.querySelectorAll('input[name=' + n + ']')].find((x) => x.value === v); if (c && !c.checked) c.click(); } return true; })()`);
  await sleep(900);
  await b.goto(`/b/tickets/${t}`, 2500);
  txt = await b.text();
  const reason = await b.eval(`document.querySelector('[name=reason]')?.value`);
  rep.check("al recargar se conservan las fotos (2 de 4) y lo escrito en el formulario", /2 de 4 fotos/.test(txt) && /cae al piso/.test(String(reason)), `${reason}`);
  const boxes = await b.eval(`JSON.stringify([...document.querySelectorAll('input[name=damage]:checked, input[name=accessories]:checked')].map((x) => x.value).sort())`);
  rep.check("el borrador recuerda cada casilla por separado (no marca todas)", boxes === JSON.stringify(["Bisagra floja", "Cargador", "Rayones"].sort()), boxes);
  rep.check("con 2 fotos «Confirmar recepción» sigue bloqueada y dice cuántas faltan", /Faltan 2 fotos obligatorias/.test(txt) && (await b.eval(`[...document.querySelectorAll('button[type=submit]')].find((x) => /Confirmar recepción/.test(x.innerText))?.disabled`)) === true);
  // el servidor también lo exige (aunque se burle el botón)
  await b.eval(`(() => { const x = [...document.querySelectorAll('button[type=submit]')].find((y) => /Confirmar recepción/.test(y.innerText)); x.disabled = false; x.click(); return true; })()`);
  await sleep(2500);
  rep.check("forzar el envío sin las 4 fotos: el servidor lo rechaza y no crea el acta", /Faltan 2 fotos/.test(await b.text()) && q(`select count(*) from receptions where ticket_id = '${t}'`) === "0");

  // ---------------------------------------------------------------- 4 · completar, resumen y confirmar
  await upload("left");
  for (let i = 0; i < 50 && ev("left") === 0; i++) await sleep(500);
  await upload("damage");
  for (let i = 0; i < 50 && ev("damage") === 0; i++) await sleep(500);
  await must(b, /4 de 4 fotos/, 20000);
  await b.waitHydrated("form [name=reason]");
  await b.eval(`(() => { const c = [...document.querySelectorAll('input[name=damage]')].find((x) => x.value === 'Otros daños'); if (c && !c.checked) c.click(); return true; })()`);
  await sleep(500);
  await b.submitIn("form:has([name=reason])");
  await sleep(2500);
  rep.check("«Otros daños» marcado sin detalles: pide describirlos y no confirma", /Describe los otros daños/.test(await b.text()) && q(`select count(*) from receptions where ticket_id = '${t}'`) === "0");
  await b.fill("observations", "Marco inferior abollado y bisagra derecha floja.");
  await sleep(700);
  txt = await b.text();
  rep.check("el resumen muestra fotos, daños y accesorios antes de confirmar", /Resumen/.test(txt) && /4 de 4 fotos/.test(txt) && /Otros daños/.test(txt));
  await shot(b, "2-escritorio-completo");
  await b.submitIn("form:has([name=reason])");
  await sleep(3500);
  rep.check("recepción confirmada: guarda daños, accesorios, motivo y detalles, y registra quién y cuándo", q(`select (visible_damage @> '{"Otros daños"}' and cardinality(visible_damage) = 3) || '|' || (accessories = '{Cargador}') || '|' || (observations like 'Marco inferior%') || '|' || (received_by = '${state.techId}') || '|' || (physical_condition is null) from receptions where ticket_id = '${t}'`) === "true|true|true|true|true");
  await b.goto(`/b/tickets/${t}`, 2500);
  txt = await b.text();
  rep.check("resultado inequívoco: «Recepción confirmada» con responsable, resumen y fotos consultables", /Recepción confirmada/.test(txt) && /Registrada por/.test(txt) && /Marco inferior abollado/.test(txt) && (await b.eval(`document.querySelectorAll('#fotos-recepcion img').length`)) >= 4);
  for (let i = 0; i < 20 && Number(q(`select count(*) from documents where ticket_id = '${t}' and doc_type = 'reception'`)) === 0; i++) await sleep(500);
  rep.check("se genera el acta en PDF y el ticket espera la firma del cliente (no pasa solo a diagnóstico)", q(`select status from tickets where id = '${t}'`) === "received" && q(`select status from documents where ticket_id = '${t}' and doc_type = 'reception'`) === "generated");
  // Firma presencial: el cliente dibuja SU firma en el dispositivo del técnico (queda el canal «assisted» y quién prestó el dispositivo).
  await b.goto(`/b/tickets/${t}`, 2500);
  await b.waitHydrated("canvas");
  rep.check("el técnico ve el acta pendiente y el recuadro para que el cliente firme", /Pendiente de firma/.test(await b.text()) && /la firma debe dibujarla el cliente/.test(await b.text()));
  rep.check("el cliente dibuja su firma en el dispositivo del técnico", await b.draw("canvas"));
  await b.check("accept");
  await sleep(500);
  await b.submit("accept");
  rep.check("la firma presencial se registra y el acta pasa a «Firmada por el cliente»", await b.waitText(/Firmada por el cliente/, 20000));
  for (let i = 0; i < 20 && q(`select status from tickets where id = '${t}'`) !== "diagnosing"; i++) await sleep(500);
  rep.check("firmada el acta, el ticket pasa solo a «En diagnóstico»", q(`select status from tickets where id = '${t}'`) === "diagnosing");
  const asg = q(`select capture_channel || '|' || (captured_by = '${state.techId}') from document_signatures where document_id = (select id from documents where ticket_id = '${t}' and doc_type = 'reception')`);
  rep.check("la constancia registra canal «assisted» y quién prestó el dispositivo", asg === "assisted|true", asg);

  // ---------------------------------------------------------------- 5 · móvil
  await b.viewport(390, 844, true);
  const t2 = q(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ('${customer}', '${svc}', 'store', 'Móvil (E2E 17).', '${state.techId}') returning id`).split("\n")[0];
  await b.goto(`/b/tickets/${t2}`, 2500);
  const cols = await b.eval(`getComputedStyle(document.querySelector('#fotos-recepcion ul')).gridTemplateColumns.split(' ').length`);
  rep.check("móvil: 2 columnas, sin desbordes y el botón principal no queda bajo la navegación", cols === 2 && (await noOverflow(b)));
  await shot(b, "3-movil");

  // ---------------------------------------------------------------- 6 · mensaje tras el pago: breve y con plazo SOLO si está configurado
  const pay = (ticket) => {
    const p = q(`select payment_id from public.begin_service_payment('${profile}', 'diagnosis', '${ticket}')`).split("\n")[0];
    const ref = q(`select external_reference from payments where id = '${p}'`);
    q(`select public.apply_payment_event('mercadopago', 'e2e17-${Date.now()}-${ticket.slice(0, 4)}', 'payment', '{}'::jsonb, true, '${ref}', 'mp-e2e17-${Date.now()}-${ticket.slice(0, 4)}', 'approved'::payment_status, 39900, 'COP')`);
  };
  const t3 = q(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ('${customer}', '${svc}', 'home', 'Pago sin plazo (E2E 17).', '${state.techId}') returning id`).split("\n")[0];
  pay(t3);
  q(`delete from app_settings where key = 'service.contact_window_hours'`);
  await clientLogin(b, state.client);
  await b.goto(`/c/tickets/${t3}`, 2500);
  txt = await b.text();
  rep.check("sin plazo configurado: «¡Pago confirmado!» + «Te contactaremos para coordinar la visita.» y NINGÚN plazo prometido", /¡Pago confirmado!/.test(txt) && /Te contactaremos para coordinar la visita\./.test(txt) && !/en un máximo de/.test(txt));
  q(`insert into app_settings (key, value, is_public) values ('service.contact_window_hours', '24', false) on conflict (key) do update set value = '24'`);
  await b.goto(`/c/tickets/${t3}`, 2500);
  txt = await b.text();
  rep.check("con el plazo configurado por administración (24 h): «Te contactaremos en un máximo de 1 día para coordinar la visita.»", /Te contactaremos en un máximo de 1 día para coordinar la visita\./.test(txt), txt.slice(txt.indexOf("Pago confirmado") - 10, txt.indexOf("Pago confirmado") + 120));
  rep.check("el mensaje no sugiere que la reparación ya empezó", !/reparación (ya )?(empez|inici)/i.test(txt));
  q(`delete from app_settings where key = 'service.contact_window_hours'`);
  rep.check("sin errores de JavaScript", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
}
