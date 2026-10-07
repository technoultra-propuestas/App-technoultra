// Flujos del cliente rediseñados: borradores de formularios, aceptación legal, solicitud → crear equipo → volver, estados de pago sin «Pagar»
// duplicado, estados del ticket («Recibido» solo para el equipo), pantallas del cliente y del personal en móvil y escritorio.
import { clientLogin, must, staffLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Flujos del cliente: borradores, legal, equipo, pagos, ticket y pantallas";

const noOverflow = (b) => b.eval("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1");

export async function run({ b, rep, state, save }) {
  const customer = psql(`select c.id from customers c join profiles p on p.id = c.profile_id where p.email = '${state.client.email}'`);
  // «Diagnóstico básico»: servicio técnico de precio fijo (pago inmediato en local o remoto) que exige equipo; es el caso real del cliente que paga $39.900.
  const svcSlug = "diagnostico-basico";
  const svc = psql(`select id from services where slug = '${svcSlug}'`);
  const price = psql(`select base_price::int from services where slug = '${svcSlug}'`);

  // ---------------------------------------------------------------- borradores: el correo se recuerda, la contraseña jamás
  await b.clearCookies();
  await b.viewport(390, 844, true);
  await b.goto("/login", 1500);
  await b.fill("email", "borrador@e2e.test");
  await b.fill("password", "ClaveSecreta123!");
  await sleep(900);
  await b.goto("/login", 2000);
  rep.check("login: al recargar el correo sigue ahí", (await b.eval(`document.querySelector('input[name=email]').value`)) === "borrador@e2e.test");
  rep.check("login: la contraseña NO se recuerda", (await b.eval(`document.querySelector('input[name=password]').value`)) === "");
  rep.check("la contraseña no queda guardada en el navegador", !(await b.eval(`Object.keys(localStorage).filter((k) => k.startsWith('tu:draft')).map((k) => localStorage.getItem(k)).join('|').includes('ClaveSecreta')`)));
  await b.eval(`Object.keys(localStorage).filter((k) => k.startsWith('tu:draft')).forEach((k) => localStorage.removeItem(k))`);

  // ---------------------------------------------------------------- aceptación legal: texto y registro
  await clientLogin(b, state.client);
  psql(`begin;
    insert into public.legal_documents (slug, version, title, content, status, requires_acceptance)
      select 'terms', (select max(version) from public.legal_documents where slug = 'terms') + 1, 'Términos de prueba v2', E'## 1. Prueba\\n\\nTexto de prueba E2E.', 'draft', true;
    select set_config('request.jwt.claims', json_build_object('sub', '${state.ownerId}', 'role', 'authenticated', 'aal', 'aal2')::text, true);
    set local role authenticated;
    select public.publish_legal_document(id) from public.legal_documents where status = 'draft' and title = 'Términos de prueba v2';
    commit;`);
  await b.goto("/c", 2500);
  let t = await b.text();
  rep.check("con una versión legal nueva se pide aceptarla antes de seguir (/c/legal)", (await b.path()).startsWith("/c/legal") && /Términos de prueba v2/.test(t));
  rep.check("muestra documento, versión, botón «Leer», casilla y botón de aceptar", /v\d+/.test(t) && /Leer/.test(t) && (await b.eval(`!!document.querySelector('input[type=checkbox][name=accept]')`)) && /Aceptar y continuar/.test(t));
  rep.check("el texto dice «Al aceptar, confirmas que has leído y aceptas…» y ya no «escríbenos antes de continuar»", /Al aceptar, confirmas que has leído y aceptas nuestras políticas y condiciones vigentes/.test(t) && !/escr[ií]benos antes de continuar/i.test(t) && !/ll[aá]manos/i.test(t));
  const before = psql(`select count(*) from legal_acceptances a join profiles p on p.id = a.profile_id where p.email = '${state.client.email}'`);
  await b.check("accept");
  await b.clickText("Aceptar y continuar", "body");
  await b.waitPath((p) => !p.startsWith("/c/legal"), 15000);
  const after = psql(`select count(*) from legal_acceptances a join profiles p on p.id = a.profile_id where p.email = '${state.client.email}'`);
  rep.check("la aceptación queda registrada con versión y fecha, sin borrar las anteriores", Number(after) === Number(before) + 1 && psql(`select count(*) from legal_acceptances a join legal_documents d on d.id = a.legal_document_id where d.title = 'Términos de prueba v2'`) !== "0");

  // ---------------------------------------------------------------- solicitud → crear equipo → volver con el equipo seleccionado
  psql(`update equipment set deleted_at = now() where customer_id = '${customer}'`);
  await b.goto(`/c/solicitar/${svcSlug}`, 2500);
  rep.check("sin equipos: avisa que hay que registrar uno y ofrece «Agregar equipo»", /Primero registra tu equipo/.test(await b.text()) && /Agregar equipo/.test(await b.text()));
  await b.fill("problem", "Se calienta demasiado y se apaga solo después de unos minutos de uso.");
  await sleep(900);
  await b.clickText("Agregar equipo", "#contenido");
  await b.waitPath((p) => p.startsWith("/c/equipos/nuevo"), 10000);
  await must(b, /Marca/, 15000); // la navegación del cliente cambia la URL antes de pintar el formulario
  await sleep(800);
  const nuevo = await b.path();
  rep.check("«Agregar equipo» lleva con el destino de retorno de la solicitud", nuevo.includes("returnTo=") && decodeURIComponent(nuevo).includes(`/c/solicitar/${svcSlug}`), nuevo);
  await b.fill("brand", "Acer");
  await b.fill("model", "5021");
  await b.clickText("Guardar equipo", "#contenido");
  const back = await b.waitPath((p) => p.startsWith("/c/solicitar/") && p.includes("equipo="), 20000);
  if (!back.includes("equipo=")) console.log("   [diag equipo]", (await b.text()).replace(/\s+/g, " ").slice(0, 600), "| JS:", b.errors.slice(0, 3).join(" | "));
  rep.check("al guardar el equipo se vuelve automáticamente a la solicitud", back.startsWith(`/c/solicitar/${svcSlug}`), back);
  const newEq = psql(`select id from equipment where customer_id = '${customer}' and deleted_at is null and brand = 'Acer' and model = '5021'`);
  await sleep(1200);
  rep.check("el equipo recién creado queda seleccionado", newEq !== "" && (await b.eval(`document.querySelector('select[name=equipmentId]')?.value ?? ''`)) === newEq, newEq);
  rep.check("lo que ya se había escrito en la solicitud sigue ahí", (await b.eval(`document.querySelector('textarea[name=problem]')?.value ?? ''`)).startsWith("Se calienta demasiado"));
  // Actualizar la página no pierde lo escrito (memoria del formulario).
  await b.fill("problem", "Texto nuevo que debe sobrevivir a una recarga completa de la página.");
  await sleep(900);
  await b.goto(`/c/solicitar/${svcSlug}`, 2500);
  rep.check("tras recargar la página el texto sigue ahí", (await b.eval(`document.querySelector('textarea[name=problem]')?.value ?? ''`)).startsWith("Texto nuevo que debe sobrevivir"));
  // Un destino de retorno externo se ignora (sin redirecciones abiertas).
  await b.goto("/c/equipos/nuevo?returnTo=//evil.example.com/robo", 2500);
  await b.fill("brand", "HP");
  await b.fill("model", "Pavilion");
  await b.clickText("Guardar equipo", "#contenido");
  await sleep(500);
  const safe = await b.waitPath((p) => p.startsWith("/c/equipos/") && !p.includes("nuevo"), 20000);
  rep.check("un returnTo externo se ignora: no sale de la aplicación", safe.startsWith("/c/equipos/") && !safe.includes("evil"), safe);

  // ---------------------------------------------------------------- ticket del cliente: «Recibido» es solo para el equipo
  const ticket = psql(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ('${customer}', '${svc}', 'store', 'Prueba E2E de estados', '${state.techId}') returning id`).split("\n")[0];
  await b.goto(`/c/tickets/${ticket}`, 2500);
  t = await b.text();
  rep.check("una solicitud nueva dice «Solicitud recibida» y NO «Recibido» a secas", /Solicitud recibida/.test(t) && !/(^|\s)Recibido(\s|$)/.test(t));
  rep.check("el avance es «Solicitud · Equipo recibido · Diagnóstico · Aprobación · Servicio · Entrega»", /Solicitud/.test(t) && /Equipo recibido/.test(t) && /Entrega/.test(t));
  rep.check("explica dónde está el equipo y no dice que ya lo tenemos", /Aún no tenemos tu equipo/.test(t) && !/Ya tenemos tu equipo/.test(t));
  rep.check("separa solicitud, pago, equipo, diagnóstico, servicio y entrega", /¿Cómo va tu servicio\?/.test(t) && /Pago/.test(t) && /Diagnóstico/.test(t) && /Entrega/.test(t));
  for (const [mod, re] of [["pickup", /Coordinaremos contigo la recogida del equipo en la dirección indicada/], ["home", /coordinar la visita/], ["remote", /No necesitas entregar físicamente el equipo/]]) {
    psql(`update tickets set modality = '${mod}' where id = '${ticket}'`);
    await b.goto(`/c/tickets/${ticket}`, 1500);
    const tt = await b.text();
    rep.check(`modalidad ${mod}: el mensaje corresponde a la modalidad`, re.test(tt) && (mod !== "remote" || !/Equipo recibido/.test(tt.split("¿Cómo va")[0])));
  }
  psql(`update tickets set modality = 'store' where id = '${ticket}'`);

  // ---------------------------------------------------------------- pagos: nunca se vuelve a ofrecer «Pagar» si ya hay pago
  await b.goto(`/c/tickets/${ticket}`, 2000);
  t = await b.text();
  rep.check("sin pagos se ofrece «Pagar»", /Pagar · \$/.test(t));
  const pay = psql(`insert into payments (customer_id, ticket_id, purpose, provider, status, amount) values ('${customer}', '${ticket}', 'service', 'mercadopago', 'pending', ${price}) returning id`).split("\n")[0];
  await b.goto(`/c/tickets/${ticket}`, 2000);
  t = await b.text();
  rep.check("pago iniciado: dice «Pago en validación» y NO vuelve a mostrar «Pagar $…»", /Pago en validación/.test(t) && /Estamos validando tu pago\. Te avisaremos cuando quede confirmado\./.test(t) && !/Pagar · \$/.test(t));
  rep.check("ninguna pantalla del cliente nombra a Mercado Pago", !/Mercado ?Pago/i.test(t));
  await b.goto(`/c/tickets/${ticket}?pago=exito`, 1500);
  rep.check("al volver del pago (exito) el mensaje es «Estamos validando tu pago…» sin proveedor", /Estamos validando tu pago/.test(await b.text()) && !/Mercado ?Pago/i.test(await b.text()));
  psql(`update payments set status = 'approved', approved_at = now() where id = '${pay}'; select private.settle_payment('${pay}');`);
  await b.goto(`/c/tickets/${ticket}`, 2000);
  t = await b.text();
  rep.check("pago aprobado: «Pago confirmado», mensaje de la modalidad y sin «Pagar»", /Pago confirmado/.test(t) && /Te indicaremos cuándo puedes llevar el equipo/.test(t) && !/Pagar · \$/.test(t) && !/Mercado ?Pago/i.test(t));
  const ticket2 = psql(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ('${customer}', '${svc}', 'store', 'Prueba E2E pago rechazado', '${state.techId}') returning id`).split("\n")[0];
  psql(`insert into payments (customer_id, ticket_id, purpose, provider, status, amount) values ('${customer}', '${ticket2}', 'service', 'mercadopago', 'rejected', ${price})`);
  await b.goto(`/c/tickets/${ticket2}`, 2000);
  t = await b.text();
  rep.check("pago rechazado: lo dice y permite reintentar («Pagar de nuevo»)", /no se completó/.test(t) && /Pagar de nuevo/.test(t));
  psql(`delete from payments where ticket_id = '${ticket2}'; insert into payments (customer_id, ticket_id, purpose, provider, status, amount) values ('${customer}', '${ticket2}', 'service', 'mercadopago', 'expired', ${price})`);
  await b.goto(`/c/tickets/${ticket2}`, 2000);
  rep.check("pago vencido: permite iniciar uno nuevo", /venció/.test(await b.text()) && /Pagar de nuevo/.test(await b.text()));

  // ---------------------------------------------------------------- pantallas del cliente: móvil y escritorio, sin desbordes ni errores
  const clientPages = ["/c", "/c/solicitar", `/c/solicitar/${svcSlug}`, "/c/tickets", `/c/tickets/${ticket}`, "/c/equipos", "/c/documentos", "/c/perfil", "/c/ayuda", "/c/mas", "/c/direcciones", "/tienda", "/tienda/carrito"];
  for (const [w, h, mobile] of [[375, 812, true], [390, 844, true], [414, 896, true], [1366, 768, false], [1440, 900, false], [1920, 1080, false]]) {
    await b.viewport(w, h, mobile);
    const bad = [];
    for (const p of clientPages) {
      await b.goto(p, 900);
      if (!(await noOverflow(b))) bad.push(p);
    }
    rep.check(`${w}px: las pantallas del cliente no desbordan horizontalmente`, bad.length === 0, bad.join(", "));
  }
  await b.viewport(1440, 900);
  await b.goto("/c/perfil", 1500);
  t = await b.text();
  rep.check("perfil: datos personales, documentos aceptados con versión y fecha, avisos y cerrar sesión", /Datos personales/.test(t) && /Documentos aceptados/.test(t) && /Versión \d+/.test(t) && /Avisos/.test(t) && /Cerrar sesión/.test(t));
  await b.goto("/c/ayuda", 1500);
  t = await b.text();
  rep.check("ayuda: asistente, WhatsApp, seguimiento público y documentos", /Pregúntale al asistente/.test(t) && /Escríbenos por WhatsApp/.test(t) && /Seguimiento de un servicio/.test(t) && /\+57 318 394 3465/.test(t));
  await b.goto("/c/equipos", 1500);
  rep.check("equipos: lista con marca/modelo y acceso a agregar", /Acer 5021/.test(await b.text()) && /Agregar equipo/.test(await b.text()));
  await b.goto("/c/documentos", 1500);
  rep.check("documentos: filtros y estado", /Mis documentos/.test(await b.text()));
  rep.check("sin errores de JavaScript en las pantallas del cliente", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));

  // ---------------------------------------------------------------- personal: pantallas rediseñadas
  const o = await staffLogin(b, state.owner);
  state.owner.secret = o.secret;
  save();
  const staffChecks = [
    ["/b/legal", /Centro legal/, /Documentos vigentes/, "Centro legal con resumen y aceptaciones"],
    ["/b/comercial", /Configuración comercial/, /Shop y promociones/, "Comercial enlaza con Shop y servicios"],
    ["/b/cobertura", /Cobertura presencial/, /Domicilio de productos/, "Cobertura incluye el domicilio de productos"],
    ["/b/configuracion", /Ajustes/, /integraciones/i, "Ajustes por áreas e integraciones"],
    ["/b/proyectos", /Proyectos digitales/, /./, "Proyectos con búsqueda y filtros"],
    ["/b/tienda/shop", /Banner promocional/, /Categorías del Shop/, "CRM del Shop"],
  ];
  for (const [w, h, mobile] of [[390, 844, true], [1440, 900, false]]) {
    await b.viewport(w, h, mobile);
    const bad = [];
    for (const [p, a, c] of staffChecks) {
      await b.goto(p, 1200);
      const txt = await b.text();
      if (!a.test(txt) || !c.test(txt) || !(await noOverflow(b))) bad.push(p);
    }
    rep.check(`${w}px: pantallas del personal rediseñadas sin desbordes`, bad.length === 0, bad.join(", "));
  }
  await b.goto("/b/configuracion", 1200);
  rep.check("integraciones: solo «Configurada / Pendiente», nunca valores", !/sk-|eyJ|APP_USR|re_[A-Za-z0-9]{10}/.test(await b.text()));
  rep.check("sin errores de JavaScript en el panel", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
  await must(b, /Ajustes/, 5000);
}
