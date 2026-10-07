// Cadena completa: CLIENTE → SOLICITUD → TICKET → RECEPCIÓN → FOTOS (Cloudinary real) → DIAGNÓSTICO → COTIZACIÓN → APROBACIÓN →
// PAGO → SERVICIO → PRUEBAS → ENTREGA → GARANTÍA → MANTENIMIENTO. Cada fase guarda su avance en el estado para poder reanudar.
import { resolve } from "node:path";
import { clientLogin, must, staffLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Flujo completo: solicitud → ticket → recepción → diagnóstico → cotización → pago → entrega → garantía";

const PHOTO = resolve("tests/e2e/fixtures/foto-prueba.png");
const SERVICE = "pantalla-azul-bsod"; // taller, requiere diagnóstico y cotización
const q = (sql) => psql(sql);
const ITEM_FORM = 'form:has(select[name=kind]):has(input[name=quoteId])';

export async function run({ b, rep, state, save }) {
  const flow = (state.flow ??= { done: [] });
  const phase = async (name, fn) => {
    if (flow.done.includes(name)) return console.log(`(fase ${name} ya hecha)`);
    const before = rep.results.filter((r) => !r.ok).length;
    try {
      await fn();
    } finally {
      save();
    }
    if (rep.results.filter((r) => !r.ok).length > before) throw new Error(`fase ${name}: hay comprobaciones fallidas`);
    flow.done.push(name);
    save();
  };
  const staff = async (who) => {
    const r = await staffLogin(b, state[who]);
    console.log("   login", who, "->", r.path);
    state[who].secret = r.secret;
    save();
    return r;
  };
  const ticketUrl = () => `/b/tickets/${flow.ticketId}`;

  // ------------------------------------------------------------------ 1. cliente crea la solicitud
  await phase("solicitud", async () => {
    const lp = await clientLogin(b, state.client);
    console.log("   tras login:", lp, state.client.email);
    await b.goto(`/c/solicitar/${SERVICE}`);
    console.log("   ruta solicitar:", await b.path());
    await b.fill("modality", "store");
    await b.fill("problem", "El equipo muestra pantalla azul al iniciar Windows y se reinicia solo (prueba E2E).");
    // Diagnóstico preliminar con IA: aparece SOLO al terminar de describir los síntomas (sin botón principal) y trae el aviso obligatorio.
    const hadButton = (await b.text()).includes("Ver diagnóstico preliminar con IA");
    rep.check("ya no hay botón «Ver diagnóstico preliminar con IA»: el análisis aparece solo", !hadButton);
    const aiShown = await b.waitText(/Según los síntomas que nos indicaste, hemos detectado que lo que podría estar afectando a tu equipo es:/, 60000);
    rep.check("el análisis contextual aparece al terminar de escribir", aiShown);
    const legal = await b.waitText(/Diagnóstico preliminar generado con asistencia de IA\. La recomendación está sujeta a verificación técnica presencial\./, 15000);
    rep.check("la IA responde con el aviso legal obligatorio", legal);
    await b.clickText("Enviar solicitud", "body");
    const p = await b.waitPath((x) => x.startsWith("/c/solicitar/listo"), 25000);
    if (!p.startsWith("/c/solicitar/listo")) console.log("   pantalla:", (await b.text()).replace(/\s+/g, " ").slice(-700));
    flow.requestCode = new URL(p, "http://x").searchParams.get("c");
    rep.check("el cliente envía la solicitud y recibe su código", /^[A-Z0-9-]{4,}$/.test(flow.requestCode ?? ""), p);
  });

  // ------------------------------------------------------------------ 2. SUPERADMIN recibe y asigna
  await phase("ticket", async () => {
    await staff("owner");
    if (!flow.ticketId) {
      // Desde el flujo automatizado, enviar la solicitud crea el ticket al instante (idempotente): ya no hay «Recibir y crear ticket» manual.
      flow.ticketId = q(`select t.id from tickets t join service_requests r on r.id = t.service_request_id where r.code = '${flow.requestCode}'`);
      rep.check("al enviar la solicitud el ticket se crea automáticamente (sin intervención del personal)", /^[0-9a-f-]{36}$/.test(flow.ticketId ?? "") && q(`select status from service_requests where code = '${flow.requestCode}'`) === "converted", flow.ticketId);
      await b.goto("/b/solicitudes");
      rep.check("la solicitud ya no queda «por atender» en la bandeja del personal", !(await b.text()).includes(flow.requestCode));
      save();
    }
    await b.goto(ticketUrl(), 1500); // recarga completa: el formulario de asignación ya está hidratado
    await must(b, /Asignar a/, 15000);
    await b.fillIn("form:has([name=staffId])", "staffId", state.techId);
    await b.submitIn("form:has([name=staffId])");
    await b.waitText(/Ticket asignado/i, 10000);
    rep.check("el ticket queda asignado al técnico", q(`select assigned_to = '${state.techId}' from tickets where id = '${flow.ticketId}'`) === "t");
  });

  // ------------------------------------------------------------------ 3. técnico: recepción + fotos reales
  await phase("recepcion", async () => {
    await staff("tech");
    await b.goto(ticketUrl());
    await must(b, /Recepción del equipo/i, 15000);
    // Primero se guarda la recepción (la interfaz solo habilita las fotos después), luego se suben las 4 fotos obligatorias.
    await b.waitHydrated("form [name=reason]");
    await b.fill("reason", "Pantalla azul recurrente; el cliente trae el equipo al local (E2E).");
    await b.check("accessories");
    await b.fill("physicalCondition", "Carcasa sin golpes; teclado con desgaste normal.");
    await b.submit("reason");
    await sleep(2500);
    rep.check("la recepción queda guardada", q(`select count(*) from receptions where ticket_id = '${flow.ticketId}'`) === "1");
    await must(b, /Frontal/, 20000);
    await b.goto(ticketUrl());
    await must(b, /Recepción del equipo/i, 15000);
    // 4 fotos obligatorias (frontal, posterior, pantalla, serial): subida directa y real a Cloudinary con firma del servidor.
    const have = Number(q(`select count(distinct slot) from evidence where ticket_id = '${flow.ticketId}' and stage = 'reception' and slot in ('front','back','screen','serial')`));
    for (let i = have; i < 4; i++) {
      // Si la página aún no hidrató, el `change` se pierde: se reintenta (como lo haría la persona al ver que no pasó nada).
      let ok = false;
      for (let attempt = 0; attempt < 3 && !(await countMarks(b, "✓") >= i + 1); attempt++) {
        await b.waitHydrated("input[type=file]");
        await b.eval("document.querySelectorAll('input[type=file]').forEach((x) => { x.value = ''; })");
        ok = await b.setFiles("input[type=file]", [PHOTO], i);
        await waitCount(b, "✓", i + 1, 25000);
      }
      const alerts = await b.eval(`[...document.querySelectorAll('[role=alert]')].map((x) => x.innerText).join(' / ')`);
      if (alerts) console.log("   aviso en pantalla:", alerts);
      const marks = await countMarks(b, "✓");
      rep.check(`foto obligatoria ${i + 1}/4 subida a Cloudinary y registrada`, ok && marks >= i + 1, `ok=${ok} marcas=${marks} ruta=${await b.path()} rec=${q(`select count(*) from evidence where ticket_id = '${flow.ticketId}'`)}`);
    }
    const ev = q(`select count(*), bool_and(cloudinary_public_id like 'technoultra/%' or cloudinary_public_id like '%${flow.ticketId}%') from evidence where ticket_id = '${flow.ticketId}' and stage = 'reception'`);
    rep.check("las 4 evidencias quedaron en la base, ligadas al ticket y a su carpeta", Number(ev.split("|")[0]) >= 4 && ev.endsWith("|t"), ev);
    await b.clickText("Pasar a «En diagnóstico»", "body");
    await sleep(3000);
    rep.check("el ticket pasa a «En diagnóstico»", q(`select status from tickets where id = '${flow.ticketId}'`) === "diagnosing");
    rep.check("el acta de recepción se genera sola", Number(q(`select count(*) from documents where ticket_id = '${flow.ticketId}' and doc_type = 'reception'`)) === 1);
  });

  // ------------------------------------------------------------------ 4. técnico: diagnóstico técnico y revisión de la IA
  await phase("diagnostico", async () => {
    await staff("tech");
    await b.goto(ticketUrl());
    await must(b, /Diagnóstico técnico/i, 15000);
    await b.fill("summary", "Fallo de memoria RAM: el módulo B presenta errores en la prueba. Se recomienda reemplazo.");
    await b.fill("testsPerformed", "Prueba de memoria completa y revisión de volcados.");
    await b.fill("recommendations", "Reemplazar módulo de RAM de 8 GB.");
    await b.check("visible");
    await b.submit("summary");
    await sleep(2500);
    rep.check("el diagnóstico técnico queda guardado y visible al cliente", q(`select visible_to_customer from diagnostics where ticket_id = '${flow.ticketId}'`) === "t");
    const aiBefore = q(`select validation_status from ai_diagnostics where ticket_id = '${flow.ticketId}'`);
    rep.check("la IA llegó ligada al ticket y pendiente de revisión humana", aiBefore === "pending", aiBefore);
    await b.clickText("Validar", "body");
    await sleep(2500);
    rep.check("el técnico valida la IA (la IA no cambia estados ni precios por sí sola)", q(`select validation_status from ai_diagnostics where ticket_id = '${flow.ticketId}'`) === "validated" && q(`select status from tickets where id = '${flow.ticketId}'`) === "diagnosing");
  });
  // ------------------------------------------------------------------ 5. técnico: cotización (servicio + repuesto) y envío
  await phase("cotizacion", async () => {
    await staff("tech");
    await b.goto(ticketUrl());
    await must(b, /Crear cotización|Agregar ítem/, 15000);
    if (await b.clickText("Crear cotización", "body")) await sleep(3000);
    await must(b, /Agregar ítem/, 15000);
    const svcId = q(`select id from services where slug = '${SERVICE}'`);
    await b.fillIn(ITEM_FORM, "refId", svcId);
    await b.submitIn(ITEM_FORM);
    await sleep(3000);
    await b.fillIn(ITEM_FORM, "kind", "custom");
    await sleep(800);
    await b.fillIn(ITEM_FORM, "description", "Módulo de memoria RAM 8 GB DDR4");
    await b.fillIn(ITEM_FORM, "unitPrice", "120000");
    await b.fillIn(ITEM_FORM, "warrantyDays", "90");
    await b.submitIn(ITEM_FORM);
    await sleep(3000);
    const items = q(`select count(*) from quote_items where quote_id = (select id from quotes where ticket_id = '${flow.ticketId}' order by version desc limit 1)`);
    rep.check("la cotización tiene el servicio y el repuesto", items === "2", items);
    await b.clickText("Enviar al cliente", "body");
    await sleep(3500);
    flow.quoteId = q(`select id from quotes where ticket_id = '${flow.ticketId}' order by version desc limit 1`);
    const qt = q(`select status || '|' || total from quotes where id = '${flow.quoteId}'`);
    rep.check("el total lo calcula el servidor (69.900 + 120.000) y la cotización queda enviada", qt === "sent|189900.00", qt);
    rep.check("el ticket queda «Esperando aprobación»", q(`select status from tickets where id = '${flow.ticketId}'`) === "awaiting_approval");
  });

  // ------------------------------------------------------------------ 6. cliente: aprueba la cotización; el pago en línea sin credenciales falla de forma segura
  await phase("aprobacion", async () => {
    await clientLogin(b, state.client);
    await b.goto(`/c/tickets/${flow.ticketId}`);
    await must(b, /Aprobar cotización/, 15000);
    await b.clickText("Aprobar cotización", "body");
    await sleep(3500);
    rep.check("el cliente aprueba y queda registrado (quién y cuándo)", q(`select status || '|' || (decided_by is not null) from quotes where id = '${flow.quoteId}'`) === "approved|true");
    await b.goto(`/c/tickets/${flow.ticketId}`);
    console.log("   pantalla:", (await b.snap(60)).replace(/[^ -~áéíóúñÁÉÍÓÚÑ¿¡·$]/g, "").slice(0, 1500));
  });
  // ------------------------------------------------------------------ 7. pago en línea sin credenciales de Mercado Pago: falla de forma segura
  await phase("pago_en_linea", async () => {
    await clientLogin(b, state.client);
    await b.goto(`/c/tickets/${flow.ticketId}`);
    await must(b, /Pagar · \$/, 15000);
    await sleep(1500);
    await b.clickText("Pagar ·", "body");
    await b.waitPath((x) => x.includes("pago="), 20000);
    const p = await b.path();
    rep.check("sin credenciales del proveedor de pagos el cliente vuelve al ticket con aviso (no_configurado)", p.includes("pago=no_configurado"), p);
    rep.check("no se crea ningún pago ni se marca nada como pagado", q(`select count(*) from payments where ticket_id = '${flow.ticketId}'`) === "0" && q(`select paid_at is null from quotes where id = '${flow.quoteId}'`) === "t");
  });

  // ------------------------------------------------------------------ 8. SUPERADMIN registra el pago manual (efectivo): idempotente y auditado
  await phase("pago_manual", async () => {
    await staff("owner");
    await b.goto(ticketUrl());
    if (q(`select count(*) from payments where ticket_id = '${flow.ticketId}'`) === "0") {
      await must(b, /Registrar pago/, 15000);
      await sleep(1500);
      await b.clickText("Registrar pago ·", "body");
      await sleep(3500);
    }
    const pay = q(`select provider || '|' || method || '|' || status || '|' || amount || '|' || purpose from payments where ticket_id = '${flow.ticketId}'`);
    rep.check("el pago manual queda aprobado por el monto del servidor", pay === "manual|cash|approved|189900.00|quote", pay);
    rep.check("la cotización queda pagada", q(`select paid_at is not null from quotes where id = '${flow.quoteId}'`) === "t");
    await b.goto(ticketUrl());
    rep.check("no se puede cobrar dos veces la misma cotización", !(await b.text()).includes("Registrar pago ·") && q(`select count(*) from payments where ticket_id = '${flow.ticketId}'`) === "1");
    const audit = q(`select count(*) from audit_logs where action ilike '%payment%'`);
    rep.check("el pago deja rastro en la auditoría", Number(audit) >= 1, audit);
  });
  // ------------------------------------------------------------------ 9. técnico: servicio → pruebas (checklist obligatorio) → listo
  await phase("servicio_pruebas", async () => {
    rep.check("tras la aprobación y el pago el ticket queda «En servicio»", q(`select status from tickets where id = '${flow.ticketId}'`) === "in_service");
    await staff("tech");
    await b.goto(ticketUrl());
    await must(b, /Checklist de pruebas/, 15000);
    await sleep(1500);
    // Sin checklist completo el servidor NO deja pasar a «Listo para entregar».
    rep.check("no se puede marcar «Listo» sin completar el checklist", q(`select 1`) === "1" && !(await b.text()).includes("Pasar a «Listo para entregar»"));
    await b.clickText("Pasar a «En pruebas»", "body");
    await sleep(3000);
    rep.check("el ticket pasa a «En pruebas»", q(`select status from tickets where id = '${flow.ticketId}'`) === "testing");
    await b.goto(ticketUrl());
    await must(b, /Iniciar checklist|obligatorias por resolver/, 15000);
    await sleep(1500);
    if (await b.clickText("Iniciar checklist", "body")) await sleep(3000);
    for (let guard = 0; guard < 40; guard++) {
      const clicked = await b.eval(`(() => { const bt = [...document.querySelectorAll('button[aria-pressed=false]')].find((x) => x.innerText.trim() === 'OK'); if (!bt) return false; bt.click(); return true; })()`);
      if (!clicked) break;
      await sleep(1300);
    }
    const pend = q(`select count(*) from checklist_items where state = 'pending' and is_required and run_id = (select id from checklist_runs where ticket_id = '${flow.ticketId}' order by created_at desc limit 1)`);
    rep.check("todas las pruebas obligatorias quedaron aprobadas", pend === "0", pend);
    await b.clickText("Completar checklist", "body");
    await sleep(3000);
    await b.clickText("Pasar a «Listo para entregar»", "body");
    await sleep(3000);
    rep.check("el ticket queda «Listo para entregar»", q(`select status from tickets where id = '${flow.ticketId}'`) === "ready");
  });

  // ------------------------------------------------------------------ 10. entrega, garantía y mantenimiento
  await phase("entrega", async () => {
    await staff("tech");
    await b.goto(ticketUrl());
    const delivered = () => q(`select status from tickets where id = '${flow.ticketId}'`) === "delivered";
    if (!delivered()) await must(b, /Fotografías de entrega/, 15000);
    await sleep(1500);
    const n = await b.eval(`document.querySelectorAll('input[type=file]').length`);
    for (let i = 0; i < 2 && !delivered(); i++) {
      for (let attempt = 0; attempt < 3 && !(await countMarks(b, "✓") >= i + 1); attempt++) {
        await b.waitHydrated("input[type=file]");
        await b.eval("document.querySelectorAll('input[type=file]').forEach((x) => { x.value = ''; })");
        await b.setFiles("input[type=file]", [PHOTO], n - 3 + i);
        await waitCount(b, "✓", i + 1, 25000);
      }
    }
    const photos = q(`select count(*) from evidence where ticket_id = '${flow.ticketId}' and stage = 'delivery'`);
    rep.check("las fotos de entrega (DESPUÉS) quedan registradas", Number(photos) >= 2, photos);
    if (!delivered() && q(`select count(*) from deliveries where ticket_id = '${flow.ticketId}'`) === "0") {
      await b.fill("receivedBy", "Cliente Prueba E2E");
      await b.fill("notes", "Entrega en local; equipo probado frente al cliente.");
      await b.submit("receivedBy");
      await sleep(3000);
    }
    rep.check("la entrega queda registrada con quién recibe", q(`select received_by_name from deliveries where ticket_id = '${flow.ticketId}'`) === "Cliente Prueba E2E");
    if (!delivered()) {
      await b.clickText("Pasar a «Entregado»", "body");
      await sleep(4500);
    }
    rep.check("el ticket queda «Entregado»", q(`select status from tickets where id = '${flow.ticketId}'`) === "delivered");
    const docs = q(`select string_agg(doc_type::text, ',' order by doc_type::text) from documents where ticket_id = '${flow.ticketId}'`);
    // La garantía de producto solo se emite si la cotización trae un producto del catálogo; aquí hay servicio + repuesto manual.
    rep.check("se generan solos el acta de entrega y la garantía de mano de obra", /delivery/.test(docs) && /warranty_labor/.test(docs), docs);
    const w = q(`select count(*) || '|' || bool_and(status = 'active') from warranties where ticket_id = '${flow.ticketId}'`);
    rep.check("las garantías quedan activas con su vigencia", /^[1-9]d*|t$/.test(w), w);
    const m = q(`select count(*) from maintenance_plans where equipment_id = (select equipment_id from tickets where id = '${flow.ticketId}')`);
    rep.check("queda programado el próximo mantenimiento del equipo", Number(m) >= 1, m);
    await b.goto(ticketUrl());
    rep.check("un ticket entregado ya no admite cambios de estado", !(await b.text()).includes("Pasar a «"));
  });

  // ------------------------------------------------------------------ 11. el cliente ve su historial, documentos y garantía
  await phase("cliente_postventa", async () => {
    await clientLogin(b, state.client);
    await b.goto(`/c/tickets/${flow.ticketId}`);
    await must(b, /Entregado/, 15000);
    rep.check("el cliente ve el ticket como entregado", /Entregado/.test(await b.text()));
    await b.goto("/c/documentos");
    const t = await b.text();
    rep.check("el cliente puede consultar sus documentos (entrega y garantías)", /garant/i.test(t), t.replace(/s+/g, " ").slice(0, 200));
    rep.check("sin errores de JavaScript en el navegador", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
  });
}

const countMarks = (b, mark) => b.eval(`[...document.querySelectorAll('button')].filter((x) => x.innerText.includes(${JSON.stringify(mark)})).length`);
async function waitCount(b, mark, n, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await countMarks(b, mark)) >= n) return true;
    await sleep(500);
  }
  return false;
}
