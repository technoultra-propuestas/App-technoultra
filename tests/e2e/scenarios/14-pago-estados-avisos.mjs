// Pago del diagnóstico (estados A–E que ve el cliente, siempre derivados de la base de datos) + centro de avisos por rol:
// aviso de pago confirmado al cliente y al técnico responsable, abrir/leer, preferencias y tarjeta de avisos del dispositivo.
import { clientLogin, must, staffLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Estados del pago del diagnóstico y centro de avisos por rol";

const q = (sql) => psql(sql);
const noOverflow = (b) => b.eval("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1");

export async function run({ b, rep, state, save }) {
  const profile = q(`select id from profiles where email = '${state.client.email}'`);
  const customer = q(`select c.id from customers c where c.profile_id = '${profile}'`);
  // Servicio de «diagnóstico técnico» cobrable (dato de prueba local; en producción lo define el propietario en el catálogo).
  q(`insert into services (slug, name, kind, base_price, allowed_modalities, is_diagnostic_fee, requires_equipment, allow_online_payment) values ('diagnostico-tecnico-e2e', 'Diagnóstico técnico', 'technical', 39900, '{store,home,pickup}', true, false, true) on conflict (slug) do nothing`);
  const diagSvc = q(`select id from services where slug = 'diagnostico-tecnico-e2e'`);
  const price = Number(q(`select base_price::int from services where id = '${diagSvc}'`));
  const money = `$${price.toLocaleString("es-CO")}`;
  const newTicket = (problem) => q(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ('${customer}', '${diagSvc}', 'store', '${problem}', '${state.techId}') returning id`).split("\n")[0];
  const t = newTicket("Prueba E2E de estados de pago.");
  const begin = () => q(`select payment_id from public.begin_service_payment('${profile}', 'diagnosis', '${t}')`).split("\n")[0];
  const open = async (suffix = "") => {
    await b.goto(`/c/tickets/${t}${suffix}`, 2200);
    return b.text();
  };
  await clientLogin(b, state.client);
  await b.viewport(390, 844, true);

  // sin pagos: se ofrece pagar y se explica el diagnóstico antes de pagar
  let txt = await open();
  rep.check("sin pago: «Diagnóstico técnico», acordeón «¿Qué incluye?» (cerrado) con qué cubre y la condición de abono, y botón «Pagar»", /Diagnóstico técnico/.test(txt) && /¿Qué incluye el diagnóstico\?/.test(txt) && /Revisión técnica del equipo/.test(await b.eval("document.body.textContent")) && /se abona al total de la reparación/.test(await b.eval("document.body.textContent")) && txt.includes(`Pagar · ${money}`), txt.slice(0, 100));
  rep.check("sin pago: no promete plazos ni menciona al proveedor", !/Mercado ?Pago/i.test(txt) && !/\b\d+\s*(horas|minutos)\b/i.test(txt));

  // A · fallido: botón «Intentar pagar nuevamente» SIEMPRE visible
  let p = begin();
  q(`update payments set status = 'rejected' where id = '${p}'`);
  txt = await open();
  rep.check("A · fallido: mensaje claro y «Intentar pagar nuevamente» visible sin abrir nada", /No se pudo completar el pago/.test(txt) && /Si tu banco registró algún movimiento/.test(txt) && txt.includes(`Intentar pagar nuevamente · ${money}`), txt.slice(0, 100));

  // B · cancelado
  p = begin();
  q(`update payments set status = 'cancelled' where id = '${p}'`);
  txt = await open();
  rep.check("B · cancelado: «Cancelaste el pago…» sin tono de error y con «Intentar pagar nuevamente»", /Cancelaste el pago/.test(txt) && txt.includes(`Intentar pagar nuevamente · ${money}`) && !/No se pudo completar/.test(txt) && /Cancelado/.test(txt));

  // C · pendiente (aunque la URL diga «fallo» manda la base de datos)
  p = begin();
  txt = await open("?pago=fallo");
  rep.check("C · pendiente: «Estamos confirmando tu pago… no necesitas volver a pagar» y NUNCA «fallido»", /Estamos confirmando tu pago/.test(txt) && /No necesitas volver a pagar/.test(txt) && /Consultar estado de pago/.test(txt) && /En validación/.test(txt) && !/No se pudo completar/.test(txt) && !/No pudimos verificar/.test(txt));
  rep.check("C · pendiente: no hay botón para pagar otra vez (sin doble cobro)", !/Intentar pagar nuevamente/.test(txt) && !txt.includes(`Pagar · ${money}`));
  rep.check("C · pendiente: sin desbordes en móvil", await noOverflow(b));

  // E · volver del pago sin ningún pago verificable
  const t2 = newTicket("Sin pagos (E2E).");
  await b.goto(`/c/tickets/${t2}?pago=fallo`, 2200);
  txt = await b.text();
  rep.check("E · sin pago verificable: «No pudimos verificar el estado de tu pago…» sin afirmar fallo ni cobro", /No pudimos verificar el estado de tu pago/.test(txt) && /no vuelvas a pagar/i.test(txt) && txt.includes(`Pagar · ${money}`));

  // D · aprobado por el servidor (evento verificado del proveedor): mensaje según la modalidad y UN solo aviso aunque el evento se repita
  const run = Date.now(); // el id de evento y el id de pago del proveedor son únicos: cada corrida usa los suyos
  const ref = q(`select external_reference from payments where id = '${p}'`);
  const ev = (id) => q(`select public.apply_payment_event('mercadopago', '${id}', 'payment', '{}'::jsonb, true, '${ref}', 'mp-e2e-${run}', 'approved'::payment_status, ${price}, 'COP')`);
  ev(`e2e-pay-${run}-1`);
  ev(`e2e-pay-${run}-1`); // reenvío exacto
  ev(`e2e-pay-${run}-2`); // otro evento del mismo pago
  txt = await open();
  rep.check("D · aprobado: «Pago confirmado» con lo que sigue según la modalidad y sin botón de pago", /Recibimos tu pago/.test(txt) && /coordinar la recepción de tu equipo/.test(txt) && !/Intentar pagar nuevamente/.test(txt) && !txt.includes(`Pagar · ${money}`));
  rep.check("D · el pago aprobado genera un solo aviso al cliente aunque el evento se repita", q(`select count(*) from notifications where recipient_id = '${profile}' and type = 'payment.approved' and entity_id = '${t}'`) === "1");
  rep.check("D · el crédito del diagnóstico se aplica una sola vez", q(`select count(*) from diagnosis_credits where ticket_id = '${t}'`) === "1");

  // centro de avisos del cliente
  await b.goto("/avisos", 2000);
  await must(b, /Recibimos tu pago/, 15000);
  txt = await b.text();
  rep.check("avisos del cliente: «¡Recibimos tu pago!» marcado como «Importante»", /Recibimos tu pago/.test(txt) && /Importante/i.test(txt));
  rep.check("avisos: tarjeta discreta de avisos del dispositivo (no pide permiso al cargar) y preferencias", /Avisos en este dispositivo/.test(txt) && /Cómo quieres que te avisemos/.test(txt) && (await b.eval("Notification.permission")) === "default");
  rep.check("avisos: el cliente no ve avisos del personal (tarea de diagnóstico, asignaciones)", !/Nuevo ticket asignado|Diagnóstico por completar|Ticket sin asignar/.test(txt));
  await b.clickText("Recibimos tu pago", "body");
  await sleep(3000);
  rep.check("abrir un aviso lleva al servicio y lo marca como leído", (await b.eval("location.pathname")).startsWith(`/c/tickets/${t}`) && q(`select count(*) from notifications where recipient_id = '${profile}' and type = 'payment.approved' and entity_id = '${t}' and read_at is not null`) === "1");

  // preferencias de correo
  await b.goto("/avisos", 1800);
  await sleep(1200);
  await b.eval("(() => { const c = document.querySelector('input[name=email]'); if (c && c.checked) c.click(); })()");
  await b.submitIn("form:has(input[name=email])");
  await sleep(3000);
  rep.check("preferencias: apagar el correo se guarda y confirma", q(`select email_enabled from notification_preferences where profile_id = '${profile}'`) === "f" && /Preferencias guardadas/.test(await b.text()), `${q(`select coalesce(email_enabled::text,'sin fila') from notification_preferences where profile_id = '${profile}'`)} · ${(await b.text()).slice(-160)}`);
  q(`update notification_preferences set email_enabled = true where profile_id = '${profile}'`);

  // el técnico responsable recibe SOLO lo de sus tickets
  const r = await staffLogin(b, state.tech);
  state.tech.secret = r.secret;
  save();
  await b.viewport(1440, 900);
  await b.goto("/avisos", 2000);
  txt = await b.text();
  rep.check("técnico: recibe «Pago confirmado» de su ticket y no avisos de administración", /Pago confirmado/.test(txt) && !/Nuevo pedido pagado|Ticket sin asignar|Transferencia por validar/.test(txt));
  rep.check("técnico: ningún otro técnico tiene avisos de ese ticket", q(`select count(*) from notifications n join profiles p on p.id = n.recipient_id where n.entity_id = '${t}' and p.role = 'technician' and p.id <> '${state.techId}'`) === "0");

  const o = await staffLogin(b, state.owner);
  state.owner.secret = o.secret;
  save();
  await b.goto("/avisos", 2000);
  txt = await b.text();
  rep.check("SUPERADMIN: ve la nueva solicitud para asignar/coordinar", /Nueva solicitud/.test(txt));
  rep.check("sin errores de JavaScript", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
}
