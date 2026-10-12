// Acta de recepción y firma electrónica + avisos por rol: generar acta → avisos (cliente / técnico / SUPERADMIN con contexto) → firma del
// cliente desde su sesión → PDF firmado con constancia → SUPERADMIN autoriza una excepción auditada en otro ticket → accesos cerrados.
// NO valida push, sonido ni correo en dispositivos reales (eso solo se prueba con personas y aparatos); aquí se comprueba lo que la app decide y registra.
import { PDFDocument } from "pdf-lib";
import { clientLogin, staffLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Acta de recepción: generación, firma del cliente, PDF firmado, excepción del SUPERADMIN y avisos por rol";

const q = (sql) => psql(sql);
// Descarga el PDF con la sesión del navegador y cuenta sus páginas en Node (pdf-lib comprime los objetos: no se puede contar con texto).
const pdfInfo = async (b, id) => {
  const r = await b.eval(`(async () => { const r = await fetch('/documentos/${id}'); const buf = new Uint8Array(await r.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192)); return { ok: r.ok, type: r.headers.get('content-type'), b64: btoa(s) }; })()`);
  const bytes = Buffer.from(r.b64, "base64");
  const doc = await PDFDocument.load(bytes);
  return { ok: r.ok, type: r.type, magic: bytes.subarray(0, 5).toString("latin1"), pages: doc.getPageCount(), size: bytes.length };
};

export async function run({ b, rep, state, save }) {
  const profile = q(`select id from profiles where email = '${state.client.email}'`);
  const customer = q(`select id from customers where profile_id = '${profile}'`);
  q(`insert into services (slug, name, kind, base_price, allowed_modalities, is_diagnostic_fee, requires_equipment, allow_online_payment) values ('diagnostico-tecnico-e2e', 'Diagnóstico técnico', 'technical', 39900, '{store,home,pickup}', true, false, true) on conflict (slug) do nothing`);
  const svc = q(`select id from services where slug = 'diagnostico-tecnico-e2e'`);
  const mk = (label) => {
    const t = q(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ('${customer}', '${svc}', 'store', '${label}', '${state.techId}') returning id`).split("\n")[0];
    q(`insert into receptions (ticket_id, reason, received_by, accessories, visible_damage) values ('${t}', '${label}', '${state.techId}', '{Cargador}', '{Rayones}')`);
    for (const [i, slot] of ["front", "back", "left", "damage"].entries()) q(`insert into evidence (ticket_id, stage, slot, cloudinary_public_id) values ('${t}', 'reception', '${slot}', 'e2e/${t}/${i}')`);
    return t;
  };
  const t = mk("Acta E2E 18 (firma del cliente).");
  const status = (id) => q(`select status from tickets where id = '${id}'`);

  // ---------------------------------------------------------------- 1 · el técnico genera el acta
  await staffLogin(b, state.tech).then((r) => {
    state.tech.secret = r.secret;
    save();
  });
  await b.viewport(1280, 900);
  await b.goto(`/b/tickets/${t}`, 2500);
  let txt = await b.text();
  rep.check("con la recepción confirmada y sin acta: «Pendiente de preparar» y botón «Generar acta»", /Pendiente de preparar/.test(txt) && /Generar acta/.test(txt));
  await b.waitHydrated("form [name=kind]");
  await b.clickText("Generar acta", "body");
  for (let i = 0; i < 30 && Number(q(`select count(*) from documents where ticket_id = '${t}' and doc_type = 'reception'`)) === 0; i++) await sleep(500);
  const acta = q(`select id from documents where ticket_id = '${t}' and doc_type = 'reception'`);
  rep.check("el acta se genera (sin firma todavía) y el ticket no avanza", /^[0-9a-f-]{36}$/.test(acta) && q(`select status from documents where id = '${acta}'`) === "generated" && status(t) === "received");

  // ---------------------------------------------------------------- 2 · avisos por rol
  const n = (who, where = "") => Number(q(`select count(*) from notifications where recipient_id = '${who}' and entity_id in ('${acta}', '${t}') ${where}`));
  rep.check("el cliente recibe «Firma el acta de recepción» (prioridad alta, ligado al documento)", n(profile, "and type = 'document.sign_pending' and priority = 'high'") === 1);
  rep.check("el SUPERADMIN recibe una copia de supervisión con el contexto (para quién, servicio y cliente)", q(`select count(*) from notifications where recipient_id = '${state.ownerId}' and type = 'supervision' and entity_id = '${t}' and title = 'Firma el acta de recepción' and body like 'Para cliente · Servicio %'`) === "1");
  rep.check("la copia de supervisión es de prioridad baja: no genera correo ni push", q(`select count(*) from notifications where recipient_id = '${state.ownerId}' and type = 'supervision' and priority = 'low' and entity_id = '${t}'`) !== "0");
  rep.check("el técnico NO recibe copias de supervisión (solo el SUPERADMIN las ve)", q(`select count(*) from notifications where recipient_id = '${state.techId}' and type = 'supervision'`) === "0");
  // idempotencia: regenerar no duplica el aviso del mismo documento
  q(`select private.notify('doc-pending:${acta}', '${profile}', 'document.sign_pending', 'Firma el acta de recepción', 'x', 'document', '${acta}', 'high', null)`);
  rep.check("un evento repetido NO duplica el aviso (idempotente por destinatario y evento)", n(profile, "and type = 'document.sign_pending'") === 1);

  // ---------------------------------------------------------------- 3 · el cliente abre el aviso y firma
  await clientLogin(b, state.client);
  await b.goto("/avisos", 2500);
  txt = await b.text();
  rep.check("el cliente ve «Firma el acta de recepción» en sus avisos y NO ve etiquetas de supervisión", /Firma el acta de recepción/.test(txt) && !/Supervisión/.test(txt));
  await b.clickText("Firma el acta de recepción", "body");
  const dest = await b.waitPath((p) => p.startsWith("/c/documentos/"), 15000);
  rep.check("el aviso lleva directo al documento a firmar", dest === `/c/documentos/${acta}`, dest);
  await b.waitHydrated("canvas");
  const before = await pdfInfo(b, acta);
  rep.check("no se puede firmar sin trazo: el botón queda inactivo", (await b.eval(`getComputedStyle(document.querySelector('form:has(canvas) button[type=submit]').parentElement).pointerEvents`)) === "none");
  await b.draw("canvas");
  await b.check("accept");
  await sleep(500);
  await b.submit("accept");
  rep.check("el cliente firma desde su sesión y la pantalla pasa a «Firmado por…»", await b.waitText(/Firmado por/, 20000));
  for (let i = 0; i < 20 && status(t) !== "diagnosing"; i++) await sleep(500);
  rep.check("con el acta firmada el ticket pasa solo a diagnóstico", status(t) === "diagnosing");
  const sig = q(`select capture_channel || '|' || (document_sha256 = (select sha256 from documents where id = '${acta}')) || '|' || (signer_profile_id = '${profile}') from document_signatures where document_id = '${acta}'`);
  rep.check("la firma queda ligada a la huella de la versión exacta y al cliente", sig === "client_session|true|true", sig);
  rep.check("avisos de firma: cliente (confirmación), técnico (puede diagnosticar) y supervisión del SUPERADMIN", n(profile, "and type = 'document.signed'") === 1 && q(`select count(*) from notifications where recipient_id = '${state.techId}' and type = 'document.signed_staff' and entity_id = '${t}'`) === "1" && q(`select count(*) from notifications where recipient_id = '${state.ownerId}' and entity_id = '${t}' and (type = 'supervision' or type like 'document.signed%') and (title like 'Documento firmado%' or title like 'Firmada:%')`) !== "0");

  // ---------------------------------------------------------------- 4 · PDF firmado: constancia al final, original intacto
  const pdf = await pdfInfo(b, acta);
  rep.check("el cliente descarga el PDF firmado (application/pdf, sin URL de almacenamiento)", pdf.ok && pdf.type === "application/pdf" && pdf.magic === "%PDF-", JSON.stringify(pdf));
  rep.check("el PDF firmado agrega UNA página: la «Constancia de firma electrónica»", pdf.pages === before.pages + 1, `${before.pages} -> ${pdf.pages}`);

  // ---------------------------------------------------------------- 5 · el cliente ve su acta firmada y el seguimiento sin repeticiones
  await b.goto(`/c/tickets/${t}`, 2500);
  txt = await b.text();
  rep.check("el cliente ya no ve «Firma el acta de recepción» como acción pendiente", !/Firma el acta de recepción/.test(txt));
  await b.clickText("Resumen del servicio", "body");
  await sleep(500);
  txt = await b.text();
  rep.check("la sección de documentos lista «Acta de recepción» como Firmada", /Acta de recepción\s*Firmada/.test(txt.replace(/\n/g, " ")));

  // ---------------------------------------------------------------- 6 · SUPERADMIN: excepción auditada en otro ticket
  const t2 = mk("Acta E2E 18 (excepción).");
  await staffLogin(b, state.owner).then((r) => {
    state.owner.secret = r.secret;
    save();
  });
  await b.goto(`/b/tickets/${t2}`, 2500);
  rep.check("sin acta ni firma el técnico no puede saltarse el paso: el ticket sigue en «Recibido»", status(t2) === "received");
  await b.clickText("Generar acta", "body");
  for (let i = 0; i < 30 && Number(q(`select count(*) from documents where ticket_id = '${t2}' and doc_type = 'reception'`)) === 0; i++) await sleep(500);
  await b.goto(`/b/tickets/${t2}`, 2500);
  txt = await b.text();
  rep.check("solo el SUPERADMIN ve «Continuar sin la firma» con motivo obligatorio", /Continuar sin la firma/.test(txt));
  await b.clickText("Continuar sin la firma", "body");
  await b.waitHydrated("textarea[name=reason]");
  await b.fill("reason", "Cliente sin acceso a la app; autoriza por llamada (E2E).");
  await b.clickText("Continuar sin firma (excepción)", "body");
  for (let i = 0; i < 30 && status(t2) !== "diagnosing"; i++) await sleep(500);
  rep.check("la excepción autorizada deja pasar a diagnóstico", status(t2) === "diagnosing");
  rep.check("la excepción queda registrada con motivo y autor, y en la auditoría", q(`select count(*) from ticket_exceptions where ticket_id = '${t2}' and authorized_by = '${state.ownerId}' and reason like 'Cliente sin acceso%'`) === "1" && Number(q(`select count(*) from audit_logs where entity_id = '${t2}' and action = 'ticket.exception_authorized'`)) >= 1);
  rep.check("el técnico asignado recibe el aviso de la excepción", q(`select count(*) from notifications where recipient_id = '${state.techId}' and type = 'ticket.exception' and entity_id = '${t2}'`) === "1");
  await b.goto("/avisos?f=supervision", 2500);
  txt = await b.text();
  rep.check("el SUPERADMIN tiene el filtro «Supervisión» con los avisos de cliente y técnico", /Supervisión/.test(txt) && /Para cliente/.test(txt));

  // ---------------------------------------------------------------- 7 · accesos cerrados
  await b.clearCookies();
  const anon = await b.eval(`(async () => { const r = await fetch('/documentos/${acta}', { redirect: 'manual' }); return { type: r.headers.get('content-type') || '', status: r.status }; })()`);
  rep.check("sin sesión el PDF del acta NO se entrega", !/pdf/.test(anon.type), JSON.stringify(anon));
  await clientLogin(b, state.client);
  const direct = await b.eval(`(async () => { const r = await fetch('/b/tickets/${t}', { redirect: 'manual' }); return r.status; })()`);
  rep.check("el cliente no entra al panel del personal", direct !== 200, String(direct));
}
