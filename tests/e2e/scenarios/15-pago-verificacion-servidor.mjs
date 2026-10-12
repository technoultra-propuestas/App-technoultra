// Verificación REAL del pago en el servidor con la API de Mercado Pago SIMULADA (solo local; ver lib/mp-mock.mjs):
// pendiente → aprobado sin recargar, API caída («no pudimos verificar»), demora > 5 min, rechazo, reingreso, doble consulta sin
// duplicados y aislamiento entre clientes. Se ejecuta con:  node tests/e2e/run.mjs 15 --mp-mock
import { resolve } from "node:path";
import { clientLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Verificación del pago en el servidor (API del proveedor simulada)";

const q = (sql) => psql(sql);
const shot = (b, name) => b.screenshot(resolve("tests/e2e/.out", `pago-${name}.png`));
const noOverflow = (b) => b.eval("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1");

export async function run({ b, rep, state, mock, out }) {
  if (!mock) {
    rep.check("escenario 15 omitido: requiere --mp-mock (API simulada)", true, "ejecuta: node tests/e2e/run.mjs 15 --mp-mock");
    return;
  }
  const profile = q(`select id from profiles where email = '${state.client.email}'`);
  const customer = q(`select c.id from customers c where c.profile_id = '${profile}'`);
  q(`insert into services (slug, name, kind, base_price, allowed_modalities, is_diagnostic_fee, requires_equipment, allow_online_payment) values ('diagnostico-tecnico-e2e', 'Diagnóstico técnico', 'technical', 39900, '{store,home,pickup}', true, false, true) on conflict (slug) do nothing`);
  const svc = q(`select id from services where slug = 'diagnostico-tecnico-e2e'`);
  const price = 39900;
  const run = Date.now();
  let seq = 0;
  /** Ticket con un pago en línea pendiente asociado a una Order simulada. */
  const scenario = (minutesAgo = 0) => {
    const t = q(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ('${customer}', '${svc}', 'store', 'Prueba E2E de verificación.', '${state.techId}') returning id`).split("\n")[0];
    const p = q(`select payment_id from public.begin_service_payment('${profile}', 'diagnosis', '${t}')`).split("\n")[0];
    const orderId = `ORD${String(run).padStart(13, "0")}E2E${String(++seq).padStart(4, "0")}`;
    q(`update payments set external_id = '${orderId}'${minutesAgo ? `, created_at = now() - interval '${minutesAgo} minutes'` : ""} where id = '${p}'`);
    const ref = q(`select external_reference from payments where id = '${p}'`);
    return { t, p, orderId, ref };
  };
  const pendingOrder = (s) => mock.setOrder(s.orderId, { status: "action_required", status_detail: "waiting_payment", external_reference: s.ref, total_amount: String(price), total_paid_amount: "0" });
  const paidOrder = (s) => mock.setOrder(s.orderId, { status: "processed", status_detail: "accredited", external_reference: s.ref, total_amount: String(price), total_paid_amount: String(price), last_updated_date: new Date().toISOString() });
  const dbStatus = (s) => q(`select status from payments where id = '${s.p}'`);
  const open = async (s, suffix = "") => {
    await b.goto(`/c/tickets/${s.t}${suffix}`, 2500);
    return b.text();
  };

  // ------------------------------------------------------------------ 1) pendiente real: se consulta al abrir y sigue pendiente
  const A = scenario();
  pendingOrder(A);
  await clientLogin(b, state.client);
  await b.viewport(390, 844, true);
  let txt = await open(A, "?pago=exito");
  await sleep(1500);
  rep.check("1 · al volver del pago el servidor consulta el estado REAL de inmediato (no se queda esperando al cron)", mock.callsFor(A.orderId) >= 1, `consultas: ${mock.callsFor(A.orderId)}`);
  txt = await b.text();
  rep.check("1 · el proveedor aún no confirma: sigue «Estamos confirmando tu pago», línea de tiempo en «En validación» y SIN botón de pago", /Estamos confirmando tu pago/.test(txt) && /En validación/.test(txt) && /Consultar estado de pago/.test(txt) && !/Intentar pagar nuevamente/.test(txt) && !/Pagar · \$/.test(txt) && dbStatus(A) === "pending", dbStatus(A));
  rep.check("1 · volver con «?pago=exito» NO aprueba nada por sí solo", dbStatus(A) === "pending" && q(`select count(*) from diagnosis_credits where ticket_id = '${A.t}'`) === "0");
  await shot(b, "1-pendiente-movil");
  rep.check("1 · una sola tarjeta de estado (sin mensajes duplicados) y sin desbordes en móvil", ((txt.match(/Estamos confirmando tu pago/g) ?? []).length === 1) && (await noOverflow(b)));

  // ------------------------------------------------------------------ 2) API caída: «no pudimos verificar», nada se marca fallido ni se permite pagar otra vez
  mock.setDown(true);
  await b.clickText("Consultar estado de pago", "body");
  await sleep(2500);
  txt = await b.text();
  rep.check("2 · si la API del proveedor falla: «No pudimos verificar el estado de tu pago», sin afirmar rechazo ni permitir otro pago", /No pudimos verificar el estado de tu pago/.test(txt) && !/No se pudo completar/.test(txt) && !/Intentar pagar nuevamente/.test(txt) && dbStatus(A) === "pending", txt.slice(0, 100));

  await shot(b, "2-sin-verificar-movil");
  // ------------------------------------------------------------------ 3) el proveedor aprueba mientras el ticket está abierto: cambia solo, sin recargar
  mock.setDown(false);
  paidOrder(A);
  const t0 = Date.now();
  let seen = false;
  for (let i = 0; i < 30 && !seen; i++) {
    await sleep(1500);
    seen = /¡Pago confirmado!/.test(await b.text());
  }
  rep.check("3 · el pago pasa a «¡Pago confirmado!» SIN recargar la página (sondeo automático)", seen, `${Math.round((Date.now() - t0) / 1000)} s`);
  txt = await b.text();
  rep.check("3 · tarjeta verde con la modalidad y las tres etapas del pago completas", /coordinar la recepción de tu equipo/.test(txt) && !/Consultar estado de pago/.test(txt) && !/Estamos confirmando tu pago/.test(txt));
  rep.check("3 · Supabase coincide: pago aprobado, monto y moneda del servidor, crédito del diagnóstico aplicado una sola vez", q(`select status || '|' || amount::int || '|' || currency from payments where id = '${A.p}'`) === `approved|${price}|COP` && q(`select count(*) from diagnosis_credits where ticket_id = '${A.t}'`) === "1");
  rep.check("3 · queda el evento verificado del proveedor (auditoría) y un solo aviso al cliente", Number(q(`select count(*) from payment_events where event_type like 'order.%' and payload->>'id' = '${A.orderId}'`)) >= 1 && q(`select count(*) from notifications where recipient_id = '${profile}' and type = 'payment.approved' and entity_id = '${A.t}'`) === "1");

  await shot(b, "3-confirmado-movil");
  await b.viewport(820, 1100, true);
  await open(A);
  rep.check("3 · tableta (820 px): sin desbordes", await noOverflow(b));
  await shot(b, "3-confirmado-tableta");
  await b.viewport(1440, 1000);
  await open(A);
  rep.check("3 · ordenador (1440 px): sin desbordes y dos columnas", (await noOverflow(b)) && (await b.eval("[...document.querySelectorAll('#contenido div.grid')].some((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length === 2)")));
  await shot(b, "3-confirmado-escritorio");
  await b.viewport(390, 844, true);
  // ------------------------------------------------------------------ 4) reingreso, recarga y doble consulta: sin duplicados
  txt = await open(A);
  rep.check("4 · al reingresar se recupera el estado persistido (confirmado)", /¡Pago confirmado!/.test(txt));
  const twice = await b.eval(`Promise.all([1,2,3].map(() => fetch('/api/pagos/estado', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticketId: '${A.t}' }) }).then((r) => r.json()))).then((x) => JSON.stringify(x.map((y) => y.state)))`);
  rep.check("4 · consultas repetidas/simultáneas devuelven el estado confirmado sin duplicar nada", twice === '["confirmed","confirmed","confirmed"]' && q(`select count(*) from notifications where recipient_id = '${profile}' and type = 'payment.approved' and entity_id = '${A.t}'`) === "1" && q(`select count(*) from diagnosis_credits where ticket_id = '${A.t}'`) === "1", twice);

  // ------------------------------------------------------------------ 5) demora > 5 minutos: aviso claro, sin marcar fallido
  const S = scenario(10);
  pendingOrder(S);
  txt = await open(S);
  await sleep(1500);
  txt = await b.text();
  await shot(b, "5-demora-movil");
  rep.check("5 · tras más de 5 minutos: «La confirmación está tardando más de lo habitual… No realices otro pago», y el pago NO se marca fallido", /tardando más de lo habitual/.test(txt) && /No realices otro pago mientras verificamos/.test(txt) && dbStatus(S) === "pending");
  q(`update payments set created_at = now() - interval '45 minutes' where id = '${S.p}'`);
  q(`select public.notify_stale_payments()`);
  q(`select public.notify_stale_payments()`);
  rep.check("5 · incidencia 'Pago en línea sin confirmar' al SUPERADMIN, una sola vez por día, y ninguna al cliente", q(`select count(*) from notifications n join profiles p on p.id = n.recipient_id where n.type = 'payment.stale' and p.role = 'superadmin' and n.entity_id = '${S.t}'`) === "1" && q(`select count(*) from notifications where type = 'payment.stale' and recipient_id = '${profile}'`) === "0");

  // ------------------------------------------------------------------ 6) rechazo del proveedor: resultado real y reintento permitido
  const R = scenario();
  mock.setOrder(R.orderId, { status: "failed", status_detail: "rejected", external_reference: R.ref, total_amount: String(price), total_paid_amount: "0", last_updated_date: new Date().toISOString() });
  await open(R);
  let failed = false;
  for (let i = 0; i < 20 && !failed; i++) {
    await sleep(1500);
    failed = /No se pudo completar el pago/.test(await b.text());
  }
  txt = await b.text();
  await shot(b, "6-rechazado-movil");
  rep.check("6 · rechazo del proveedor: tarjeta roja, «Intentar pagar nuevamente · $39.900» visible y «Confirmado» no se alcanza", failed && txt.includes("Intentar pagar nuevamente · $39.900") && /Rechazado/.test(txt) && dbStatus(R) === "rejected", dbStatus(R));
  rep.check("6 · el cliente recibe un aviso del rechazo y el SUPERADMIN una incidencia", q(`select count(*) from notifications where recipient_id = '${profile}' and type = 'payment.failed' and entity_id = '${R.t}'`) === "1" && q(`select count(*) from notifications where type = 'payment.incident' and entity_id = '${R.t}'`) === "1");

  // ------------------------------------------------------------------ 7) aislamiento: otro cliente no puede consultar ni ver el pago ajeno
  const C = scenario();
  pendingOrder(C);
  const before = mock.callsFor(C.orderId);
  await clientLogin(b, state.clientB);
  await b.goto("/c", 1500);
  const foreign = await b.eval(`fetch('/api/pagos/estado', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticketId: '${C.t}' }) }).then((r) => r.json()).then((j) => JSON.stringify(j))`);
  rep.check("7 · otro cliente consulta el ticket ajeno: responde «none» y NO se consulta al proveedor", /"state":"none"/.test(foreign) && mock.callsFor(C.orderId) === before, foreign);
  rep.check("7 · y no se ve ningún pago ajeno en sus avisos", q(`select count(*) from notifications where entity_id = '${C.t}' and recipient_id <> '${profile}' and type like 'payment.%' and recipient_id in (select id from profiles where role = 'client')`) === "0");
  rep.check("sin errores de JavaScript", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
}
