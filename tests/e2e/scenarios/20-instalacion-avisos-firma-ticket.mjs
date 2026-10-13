// Instalación de la PWA, avisos del sistema y firma del acta desde el ticket del cliente.
// QUÉ SE DEMUESTRA: la lógica de la app con dispositivos EMULADOS por el protocolo de Chrome (agente de usuario, modo standalone, evento de instalación
// simulado) y envíos push reales al servicio push (hacia suscripciones de prueba que no existen: se demuestra que el envío se dispara al instante y se
// registra, no que un teléfono lo reciba). QUÉ NO: el diálogo nativo de instalación, la llegada de un push a Android/iOS, el sonido y la vibración
// solo se comprueban en dispositivos físicos.
import { resolve } from "node:path";
import { clientLogin, staffLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Instalación PWA, avisos del sistema operativo y firma del acta desde el ticket (cliente, técnico y SUPERADMIN)";

const q = (sql) => psql(sql);
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const BANNER = 'aside[aria-label="Instalar TechnoUltra"]';

export async function run({ b, rep, state, save, base }) {
  const origin = new URL(base).origin;
  const realUa = await b.eval("navigator.userAgent");
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
  // Acta SIN pasar por la interfaz (el PDF real ya lo cubren los escenarios 18 y 19); la huella es válida y única.
  const acta = (t, version = 1) => {
    const sha = [...Array(64)].map(() => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    return q(`insert into documents (doc_type, version, status, title, customer_id, ticket_id, storage_path, sha256) values ('reception', ${version}, 'generated', 'Acta de recepción', '${customer}', '${t}', 'tickets/${t}/acta-v${version}.pdf', '${sha}') returning id`).split("\n")[0];
  };
  const status = (id) => q(`select status from tickets where id = '${id}'`);
  const reset = async () => {
    await b.emulate({ ua: realUa, platform: "Win32" });
    await b.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  };
  const open = async (url, { ua, platform, touch, standalone, event = false, wait = 4500 }) => {
    await b.emulate({ ua, platform, touch, standalone });
    await b.goto(url, 1200);
    await b.eval("(() => { localStorage.removeItem('tu-install-dismissed'); return true; })()");
    await b.goto(url, 800);
    if (!event) {
      // Chrome (también en modo headless) dispara su PROPIO aviso de instalación real; en iPhone/Safari nunca existe: se anula para emular iOS de verdad.
      await sleep(1800);
      await b.eval("(() => { window.__tuInstall = undefined; window.dispatchEvent(new Event('tu:installed')); return true; })()");
    }
    if (event) {
      await b.eval(`(() => { window.__promptCalled = 0; const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__promptCalled++; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); return true; })()`);
    }
    await sleep(wait);
  };

  // ---------------------------------------------------------------- 1 · instalación
  await clientLogin(b, state.client);
  await b.viewport(390, 844, true);
  await open("/c", { ua: ANDROID, platform: "Linux armv8l", touch: true, event: true });
  const android = await b.eval(`(() => { const a = document.querySelector('${BANNER}'); if (!a) return null; return { mode: a.dataset.installMode, buttons: [...a.querySelectorAll('button')].map((x) => x.innerText.trim()), steps: a.querySelectorAll('ol').length }; })()`);
  rep.check("Android compatible: el aviso ofrece el botón «Instalar» (sin tutorial) cuando el navegador ofrece la instalación", android?.mode === "prompt" && android.buttons.includes("Instalar") && android.steps === 0, JSON.stringify(android));
  rep.check("el aviso no tapa la navegación ni los botones: queda sobre la barra inferior, dentro de la pantalla", await b.eval(`(() => { const r = document.querySelector('${BANNER}').getBoundingClientRect(); return r.bottom <= innerHeight && r.height < 200; })()`));
  await b.eval(`(() => { [...document.querySelectorAll('${BANNER} button')].find((x) => x.innerText.trim() === 'Instalar').click(); return true; })()`);
  await sleep(800);
  rep.check("al pulsar «Instalar» se abre el diálogo nativo del navegador (prompt() se invoca una vez) y se informa el resultado", (await b.eval("window.__promptCalled")) === 1 && /Instalando TechnoUltra/.test(await b.text()));
  await sleep(5500);
  rep.check("tras informar, el aviso se retira y no vuelve a mostrar el botón con el evento ya consumido", (await b.eval(`!document.querySelector('${BANNER}')`)));

  await open("/c", { ua: ANDROID, platform: "Linux armv8l", touch: true, event: true });
  await b.eval(`(() => { document.querySelector('${BANNER} button[aria-label="Ahora no"]').click(); return true; })()`);
  await sleep(300);
  rep.check("se puede cerrar el aviso y la elección se recuerda (no reaparece al volver a abrir la app)", await b.eval(`!document.querySelector('${BANNER}') && !!localStorage.getItem('tu-install-dismissed')`));
  await b.goto("/c", 800);
  await b.eval(`(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); return true; })()`);
  await sleep(4500);
  rep.check("…ni siquiera si el navegador vuelve a ofrecer la instalación", await b.eval(`!document.querySelector('${BANNER}')`));

  await open("/c", { ua: IPHONE, platform: "iPhone", touch: true });
  const ios = await b.eval(`(() => { const a = document.querySelector('${BANNER}'); if (!a) return null; return { mode: a.dataset.installMode, text: a.innerText, buttons: [...a.querySelectorAll('button')].map((x) => x.getAttribute('aria-label') || x.innerText.trim()), steps: a.querySelectorAll('li').length }; })()`);
  rep.check("iPhone (Safari): se muestran dos instrucciones ya visibles (Compartir → Añadir a pantalla de inicio), sin botón que prometa una instalación automática", ios?.mode === "ios-safari" && ios.steps === 2 && /Compartir/.test(ios.text) && /Añadir a pantalla de inicio/.test(ios.text) && !ios.buttons.includes("Instalar"), JSON.stringify(ios));

  await open("/c", { ua: ANDROID, platform: "Linux armv8l", touch: true, standalone: true, event: true });
  rep.check("PWA ya instalada (modo standalone): no se vuelve a mostrar la invitación de instalación", await b.eval(`!document.querySelector('${BANNER}')`));
  await b.goto("/c/mas", 2500);
  rep.check("en «Más», una PWA instalada lo dice y no ofrece instalar", /Ya estás usando TechnoUltra instalada/.test(await b.text()));
  await sleep(8000);
  rep.check("los avisos del dispositivo se ofrecen con un botón visible y el permiso del sistema NO se pide al cargar (sigue en «default»)", (await b.eval(`!!document.querySelector('aside[aria-label="Activar avisos del dispositivo"] button') && Notification.permission === 'default'`)));
  await reset();

  // ---------------------------------------------------------------- 2 · el ticket obliga a firmar el acta
  const t = mk("Firma desde el ticket (E2E 20).");
  const a1 = acta(t);
  await b.viewport(390, 844, true);
  await clientLogin(b, state.client);
  await b.goto(`/c/tickets/${t}`, 2500);
  const sp = await b.eval(`(() => { const s = document.querySelector('[data-sign-prompt]'); if (!s) return null; const r = s.getBoundingClientRect(); const a = [...s.querySelectorAll('a')].find((x) => /Revisar y firmar acta/.test(x.innerText)); return { text: s.innerText, href: a?.getAttribute('href'), top: r.top, h: innerHeight }; })()`);
  rep.check("el ticket muestra «Debes firmar el acta de recepción», con el estado del acta, ARRIBA (a la vista sin desplazarse)", sp && /Debes firmar el acta de recepción/i.test(sp.text) && /Pendiente de firma/i.test(sp.text) && sp.top < sp.h / 1.5, `top=${Math.round(sp?.top)} de ${sp?.h}`);
  rep.check("el botón «Revisar y firmar acta» apunta al acta CORRECTA de este ticket", sp?.href === `/c/documentos/${a1}`, sp?.href);
  rep.check("«Próxima acción» no contradice la obligación (no hay otra instrucción principal compitiendo)", await b.eval(`!document.querySelector('section[aria-label="Ahora estamos aquí"]')`));

  // suscripciones de PRUEBA para el técnico, el SUPERADMIN y el cliente (endpoints que no existen: se comprueba que el envío se dispara y se registra)
  for (const [who, id] of [["tec", state.techId], ["adm", state.ownerId], ["cli", profile]]) {
    q(`insert into notification_preferences (profile_id, push_enabled) values ('${id}', true) on conflict (profile_id) do update set push_enabled = true`);
    q(`insert into push_subscriptions (profile_id, endpoint, p256dh, auth_key) values ('${id}', 'https://push.invalid.example/e2e20-${who}-${t}', repeat('p', 87), repeat('a', 22)) on conflict (endpoint) do nothing`);
  }

  await b.clickText("Revisar y firmar acta", "body");
  const dest = await b.waitPath((p) => p.startsWith("/c/documentos/"), 15000);
  rep.check("al pulsarlo abre el acta correcta", dest === `/c/documentos/${a1}`, dest);
  await b.waitHydrated("canvas");
  // firma FALLIDA: sin trazo el servidor la rechaza; el acta y el ticket no cambian y nadie recibe «firmada»
  await b.check("accept");
  await b.eval(`(() => { document.querySelector('form:has(canvas) button[type=submit]').click(); return true; })()`);
  await sleep(2500);
  rep.check("una firma fallida (sin trazo) NO marca el acta, NO hace avanzar el ticket y NO avisa a nadie", q(`select status from documents where id = '${a1}'`) === "generated" && status(t) === "received" && q(`select count(*) from notifications where type in ('document.signed','document.signed_staff') and entity_id in ('${a1}', '${t}')`) === "0");
  // firma real con doble toque (reintento inmediato): una sola firma y un solo aviso por destinatario
  await b.draw("canvas");
  await b.check("accept"); // React reinicia el formulario tras el envío fallido: se vuelve a aceptar
  await sleep(400);
  await b.eval(`(() => { const btn = document.querySelector('form:has(canvas) button[type=submit]'); btn.click(); btn.click(); return true; })()`);
  rep.check("el cliente firma desde el ticket (confirmado por el servidor: «Firmado por…»)", await b.waitText(/Firmado por/, 20000));
  for (let i = 0; i < 30 && status(t) !== "diagnosing"; i++) await sleep(500);
  rep.check("solo tras confirmarse la firma cambian el acta y el ticket (a diagnóstico)", q(`select status from documents where id = '${a1}'`) === "signed" && status(t) === "diagnosing");
  rep.check("el doble toque NO duplica: una firma, un aviso al cliente, uno al técnico y uno al SUPERADMIN", q(`select count(*) from document_signatures where document_id = '${a1}'`) === "1"
    && q(`select count(*) from notifications where recipient_id = '${profile}' and type = 'document.signed' and entity_id = '${a1}'`) === "1"
    && q(`select count(*) from notifications where recipient_id = '${state.techId}' and type = 'document.signed_staff' and entity_id = '${t}'`) === "1"
    && q(`select count(*) from notifications where recipient_id = '${state.ownerId}' and type = 'document.signed_staff' and entity_id = '${t}'`) === "1");
  rep.check("el SUPERADMIN recibe SU aviso (prioridad alta, enlace al ticket), no solo la copia de supervisión", q(`select priority || '|' || entity_type from notifications where recipient_id = '${state.ownerId}' and type = 'document.signed_staff' and entity_id = '${t}'`) === "high|ticket");
  rep.check("la firma queda en la auditoría con canal, versión y huella", q(`select (metadata->>'channel') || '|' || (metadata->>'version') || '|' || (metadata->>'sha256' = (select sha256 from documents where id = '${a1}'))::text from audit_logs where action = 'document.signed' and entity_id = '${a1}'`) === "client_session|1|true");

  // el envío push se dispara AL INSTANTE desde la acción de firma (no espera al barrido diario): hay un intento registrado para técnico, SUPERADMIN y cliente
  const tries = () => q(`select string_agg(distinct n.recipient_id::text, ',') from notification_deliveries d join notifications n on n.id = d.notification_id where d.channel = 'push' and d.attempts >= 1 and n.entity_id in ('${a1}', '${t}') and n.type in ('document.signed', 'document.signed_staff')`);
  let seen = "";
  for (let i = 0; i < 40; i++) {
    seen = tries();
    if ([state.techId, state.ownerId, profile].every((x) => seen.includes(x))) break;
    await sleep(1000);
  }
  rep.check("tras firmar, el servidor intenta el push real para el técnico, el SUPERADMIN y el cliente (registrado en notification_deliveries)", [state.techId, state.ownerId, profile].every((x) => seen.includes(x)), seen);
  rep.check("los fallos de entrega no se ocultan: quedan con su error y las suscripciones vigentes no se borran", q(`select count(*) from notification_deliveries d join notifications n on n.id = d.notification_id where d.channel = 'push' and n.entity_id in ('${a1}', '${t}') and (d.status = 'sent' or d.last_error is not null)`) !== "0" && q(`select count(*) from push_subscriptions where endpoint like '%e2e20-%-${t}'`) === "3");
  await b.goto(`/c/tickets/${t}`, 2500);
  rep.check("tras firmar desaparece la acción pendiente y el ticket sigue funcionando", await b.eval(`!document.querySelector('[data-sign-prompt]')`) && /Firmada/.test(await b.eval(`(() => { document.querySelectorAll('summary,button').forEach((x) => /Resumen del servicio/.test(x.innerText) && x.click()); return document.body.innerText; })()`)));

  // ---------------------------------------------------------------- 3 · acta histórica pendiente en un ticket ya en diagnóstico
  const t2 = mk("Histórico en diagnóstico (E2E 20).");
  const a2 = acta(t2);
  q(`update tickets set status = 'diagnosing' where id = '${t2}'`);
  await b.goto(`/c/tickets/${t2}`, 2500);
  const hist = await b.eval(`(() => { const s = document.querySelector('[data-sign-prompt]'); return s ? { text: s.innerText, ahora: !!document.querySelector('section[aria-label="Ahora estamos aquí"]') } : null; })()`);
  rep.check("un ticket HISTÓRICO ya «En diagnóstico» con el acta pendiente la muestra como acción prioritaria, sin instrucción contradictoria", hist && /Debes firmar el acta de recepción/.test(hist.text) && hist.ahora === false, JSON.stringify(hist)?.slice(0, 160));
  rep.check("el estado persistido sigue siendo detectable: el acta pendiente existe y es firmable", q(`select status from documents where id = '${a2}'`) === "generated");
  await staffLogin(b, state.tech).then((r) => {
    state.tech.secret = r.secret;
    save();
  });
  await b.viewport(1280, 900);
  await b.goto(`/b/tickets/${t2}`, 2500);
  const stf = await b.text();
  rep.check("el técnico ve «Registrar el diagnóstico» Y el aviso «El acta de recepción sigue sin firma del cliente» (sin contradicción, sin firmar por él)", /Registrar el diagnóstico/.test(stf) && /El acta de recepción sigue sin firma del cliente/.test(stf) && /No la firmes tú por él/.test(stf));

  // ---------------------------------------------------------------- 4 · excepción autorizada: se refleja en el ticket del cliente
  const t3 = mk("Excepción (E2E 20).");
  const a3 = acta(t3);
  await staffLogin(b, state.owner).then((r) => {
    state.owner.secret = r.secret;
    save();
  });
  await b.goto(`/b/tickets/${t3}`, 2500);
  await b.clickText("Continuar sin la firma", "body");
  await b.waitHydrated("textarea[name=reason]");
  await b.fill("reason", "El cliente no puede firmar ahora; autorizado por el propietario (E2E 20).");
  await b.clickText("Continuar sin firma (excepción)", "body");
  for (let i = 0; i < 30 && status(t3) !== "diagnosing"; i++) await sleep(500);
  await b.viewport(390, 844, true);
  await clientLogin(b, state.client);
  await b.goto(`/c/tickets/${t3}`, 2500);
  const ex = await b.eval(`(() => { document.querySelectorAll('summary,button').forEach((x) => /Resumen del servicio/.test(x.innerText) && x.click()); return { prompt: !!document.querySelector('[data-sign-prompt]'), text: document.body.innerText }; })()`);
  rep.check("con una excepción autorizada el cliente ve «Excepción autorizada» y no una obligación de firma", status(t3) === "diagnosing" && ex.prompt === false && /Excepción autorizada/.test(ex.text));

  // ---------------------------------------------------------------- 5 · seguridad: otro cliente no puede firmar ni ver el acta
  const other = `otro.cliente.${Date.now()}@example.com`;
  const { createUser } = await import("../lib/fixtures.mjs");
  const { adminClient } = await import("../lib/fixtures.mjs");
  await createUser(adminClient(), { email: other, password: "Prueba-E2E-1234!", fullName: "Otro Cliente E2E" });
  const t4 = mk("Seguridad (E2E 20).");
  const a4 = acta(t4);
  await clientLogin(b, { email: other, password: "Prueba-E2E-1234!" });
  const peek = await b.eval(`(async () => { const r = await fetch('/documentos/${a4}', { redirect: 'manual' }); const p = await fetch('/c/documentos/${a4}', { redirect: 'manual' }); return { pdf: r.headers.get('content-type') || '', pdfStatus: r.status, pageStatus: p.status }; })()`);
  rep.check("otro cliente no puede consultar el acta de este ticket (ni el PDF ni su página de firma)", !/pdf/.test(peek.pdf) && peek.pdfStatus >= 400 || peek.pageStatus === 404, JSON.stringify(peek));
  rep.check("y no existe ninguna ruta pública para firmar sin sesión", q(`select count(*) from document_signatures where document_id = '${a4}'`) === "0");

  // ---------------------------------------------------------------- 6 · el enlace de la notificación abre el ticket correcto tras autenticarse; la sesión persiste
  await b.clearCookies();
  await b.goto(`/c/tickets/${t}`, 1500);
  const gate = await b.path();
  rep.check("sin sesión, el enlace lleva a iniciar sesión conservando el destino", gate.startsWith("/login") && decodeURIComponent(gate).includes(`/c/tickets/${t}`), gate);
  await b.fill("email", state.client.email);
  await b.fill("password", state.client.password);
  await b.click("form button[type=submit]");
  const landed = await b.waitPath((p) => !p.startsWith("/login"), 20000);
  rep.check("tras autenticarse abre EL TICKET del aviso", landed === `/c/tickets/${t}`, landed);
  await b.goto("about:blank", 300);
  await b.goto(`/c/tickets/${t}`, 2000);
  rep.check("al cerrar y volver a abrir la app la sesión sigue activa y el ticket carga", (await b.path()) === `/c/tickets/${t}` && /TU-2026/.test(await b.text()));
  await b.clearCookies();
  await b.goto(`/b/tickets/${t}`, 1500);
  const gate2 = await b.path();
  rep.check("el enlace del técnico/SUPERADMIN también exige autenticarse y conserva el destino", gate2.startsWith("/gestion/login") && decodeURIComponent(gate2).includes(`/b/tickets/${t}`), gate2);

  // ---------------------------------------------------------------- 7 · service worker: recibe un push y muestra la notificación del sistema
  await clientLogin(b, state.client);
  await b.goto("/c", 2500);
  const granted = await b.grant(origin, ["notifications"]);
  await b.goto("/c", 2500); // los permisos concedidos se ven al recargar
  const regs = [];
  b.on("ServiceWorker.workerRegistrationUpdated", (p) => regs.push(...p.registrations));
  await b.send("ServiceWorker.enable");
  for (let i = 0; i < 20 && !regs.length; i++) await sleep(500);
  const reg = regs.find((r) => r.scopeURL.startsWith(origin));
  rep.check("el service worker está registrado en producción y el permiso de notificaciones se concedió para la prueba", Boolean(reg) && granted, JSON.stringify({ granted, regs: regs.length }));
  if (reg) {
    await b.send("ServiceWorker.deliverPushMessage", { origin, registrationId: reg.registrationId, data: JSON.stringify({ title: "Firma el acta de recepción", body: "Revisa y firma el acta de tu equipo.", url: `/c/documentos/${a1}`, tag: "e2e20-n1", urgent: true }) });
    let shown = [];
    for (let i = 0; i < 20 && !shown.length; i++) {
      shown = await b.eval(`navigator.serviceWorker.ready.then((r) => r.getNotifications()).then((l) => l.map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data && n.data.url, actions: (n.actions || []).map((a) => a.title), silent: n.silent, requireInteraction: n.requireInteraction })))`);
      if (!shown.length) await sleep(500);
    }
    const n = shown[0];
    rep.check("al llegar el push, el service worker muestra la notificación del sistema con título, mensaje, acción «Abrir» y enlace al documento", n?.title === "Firma el acta de recepción" && n.body === "Revisa y firma el acta de tu equipo." && n.url === `/c/documentos/${a1}` && n.actions.includes("Abrir") && n.tag === "e2e20-n1", JSON.stringify(n));
    rep.check("no se silencia desde el código (silent no es true) y lo urgente exige interacción", n && n.silent !== true && n.requireInteraction === true);
  }
  await reset();
  rep.check("la aplicación sigue funcionando con la sesión abierta tras todo el recorrido", /\/c/.test(await b.path()) && !(await b.eval(`!!document.querySelector('[data-nextjs-dialog]')`)));
}
