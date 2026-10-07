// Tienda pública del catálogo Excelenter: navegación por categorías/subcategorías, WhatsApp, disponibilidad, ocultamiento y administración.
// Los datos de prueba se cargan SOLO en la base local, con el mismo motor de sincronización de producción (sync_catalog).
import { staffLogin } from "../lib/actors.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Tienda Excelenter: catálogo público, WhatsApp, disponibilidad y administración";

const item = (id, over = {}) => ({ source_product_id: id, source_ref: id, name: `Producto E2E ${id}`, brand: "ACME", category: "Periféricos", subcategory: "Mouse", price: 100000, stock: 1, description: `Descripción de ${id}\n\nSegunda línea.`, image_url: `https://res.cloudinary.com/e2e/image/upload/v1/${id}.webp`, ...over });
const sync = (items) => psql(`select public.sync_catalog('EXCELENTER', $j$${JSON.stringify(items)}$j$::jsonb, 'import')::text;`);
const catalog = (over = {}) => [
  item("E2E-M1", { name: "Mouse E2E inalámbrico", price: 100000 }),
  item("E2E-M2", { name: "Mouse E2E óptico", price: 90000 }),
  item("E2E-K1", { name: "Teclado E2E", subcategory: "Teclados", price: 110000 }),
  item("E2E-P1", { name: "Procesador E2E", category: "Componentes", subcategory: "Procesadores", price: 490000 }),
  item("E2E-D1", { name: "Disco E2E", category: "Almacenamiento", subcategory: "Discos externos", price: 450000, ...over.disk }),
  ...Array.from({ length: 24 }, (_, i) => item(`E2E-F${i}`, { name: `Zfunda E2E ${String(i).padStart(2, "0")}`, category: "Portátiles", subcategory: "Fundas", price: 35000 })),
];

const noOverflow = (b) => b.eval("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1");

export async function run({ b, rep, state, save, base }) {
  // Limpieza solo en la base LOCAL: el historial de precios es inmutable por diseño, así que se desactivan los disparadores en esta sesión.
  psql(`set session_replication_role = replica;
        delete from public.product_inquiries; delete from public.order_items where product_id in (select id from public.products where source is not null);
        delete from public.product_price_history; delete from public.product_source; delete from public.products where source is not null; delete from public.catalog_sync_runs;`);
  const r1 = JSON.parse(sync(catalog()));
  rep.check("la importación inicial crea los 29 productos sin errores", r1.status === "success" && r1.created === 29 && r1.errors === 0, JSON.stringify(r1));

  // ---------------------------------------------------------------- público, sin sesión
  await b.clearCookies();
  await b.viewport(390, 844, true);
  await b.goto("/tienda", 2500);
  let t = await b.text();
  rep.check("/tienda es pública (sin iniciar sesión) y muestra el catálogo", /Tienda/.test(t) && /Mouse E2E inalámbrico/.test(t) && (await b.path()) === "/tienda");
  rep.check("muestra precio TechnoUltra (+20 %) y «1 unidad disponible»", /\$120\.000/.test(t) && /\$108\.000/.test(t) && /\$132\.000/.test(t) && /1 unidad disponible/.test(t));
  rep.check("no muestra el costo del proveedor", !/\$100\.000/.test(t) && !/\$90\.000/.test(t));
  rep.check("incluye la advertencia de disponibilidad y el domicilio ($10.000 / $20.000)", /sujetos a confirmación por WhatsApp/.test(t) && /\$10\.000/.test(t) && /\$20\.000/.test(t) && /perímetro urbano/.test(t));
  rep.check("no hay carrito, pago ni Mercado Pago para estos productos", !/Mercado Pago|Añadir al carrito|Agregar al carrito|Pagar/i.test(t));
  rep.check("móvil: sin desbordes horizontales", await noOverflow(b));
  const links = await b.eval(`[...document.querySelectorAll('a[href^="https://wa.me/"]')].map((a) => a.href)`);
  rep.check("cada producto tiene su enlace a WhatsApp del negocio (573183943465) con mensaje", links.length >= 20 && links.every((h) => h.startsWith("https://wa.me/573183943465?text=") && h.length > 120), `${links.length} enlaces`);
  const count = await b.eval(`document.querySelectorAll('article').length`);
  rep.check("pagina de 24 en 24 (no carga todo)", count === 24, String(count));
  rep.check("hay paginación", /Página 1 de 2/.test(t));
  await b.goto("/tienda?pagina=2", 1500);
  t = await b.text();
  rep.check("la página 2 muestra el resto", /Página 2 de 2/.test(t));

  // Categorías y subcategorías (relación padre → hijo exacta).
  await b.goto("/tienda/categoria/componentes", 1500);
  t = await b.text();
  rep.check("la categoría «Componentes» solo lista sus productos y su subcategoría «Procesadores»", /Procesador E2E/.test(t) && !/Mouse E2E/.test(t) && /Procesadores/.test(t));
  await b.goto("/tienda/categoria/perifericos/teclados", 1500);
  t = await b.text();
  rep.check("la subcategoría «Teclados» de «Periféricos» solo lista teclados", /Teclado E2E/.test(t) && !/Mouse E2E/.test(t));
  await b.goto("/tienda/categoria/componentes/teclados", 1200);
  rep.check("una subcategoría que no pertenece a esa categoría da 404", /no se encontr|404|no existe/i.test(await b.text()));
  await b.goto("/tienda/categoria/no-existe", 1200);
  rep.check("una categoría inexistente da 404", /no se encontr|404|no existe/i.test(await b.text()));

  // Búsqueda, filtros y orden.
  await b.goto("/tienda?q=procesador", 1500);
  rep.check("la búsqueda encuentra por nombre", /Procesador E2E/.test(await b.text()) && !/Mouse E2E/.test(await b.text()));
  await b.goto("/tienda?q=zzzzzz", 1500);
  rep.check("sin resultados muestra un estado vacío claro", /No encontramos productos/.test(await b.text()));
  await b.goto("/tienda?q=%25%27%3B--", 1500);
  rep.check("una búsqueda con caracteres de inyección no rompe la página", !/error|algo salió mal/i.test(await b.text()) && (await b.path()).startsWith("/tienda"));
  await b.goto("/tienda?min=100000&max=120000&orden=precio-desc", 1500);
  t = await b.text();
  rep.check("el filtro de precio se aplica en el servidor sobre el precio final ($100.000–$120.000: $120.000 y $108.000 sí; $132.000 no)", /Mouse E2E inalámbrico/.test(t) && /Mouse E2E óptico/.test(t) && !/Teclado E2E/.test(t) && !/Procesador E2E/.test(t) && !/Zfunda/.test(t));

  // Ficha de producto.
  await b.goto("/tienda?q=inal%C3%A1mbrico", 1500);
  const href = await b.eval(`document.querySelector('a[href^="/tienda/producto/"]').getAttribute('href')`);
  await b.goto(href, 2000);
  t = await b.text();
  const wa = await b.eval(`document.querySelector('a[href^="https://wa.me/"]').href`);
  const msg = decodeURIComponent(wa.split("?text=")[1] ?? "");
  rep.check("la ficha muestra producto, referencia, precio, disponibilidad y la advertencia", /Mouse E2E inalámbrico/.test(t) && /Referencia: E2E-M1/.test(t) && /\$120\.000/.test(t) && /1 unidad disponible/.test(t) && /sujetos a confirmación por WhatsApp/.test(t));
  rep.check("botón principal «Consultar y comprar por WhatsApp»", /Consultar y comprar por WhatsApp/.test(t));
  rep.check("el mensaje prellenado tiene producto, referencia y precio publicado, bien codificado", wa.startsWith("https://wa.me/573183943465?text=") && msg.startsWith("Hola TechnoUltra 👋") && /Producto: Mouse E2E inalámbrico/.test(msg) && /Referencia: E2E-M1/.test(msg) && /Precio publicado: \$120\.000/.test(msg) && /opciones de entrega\?$/.test(msg));
  const ld = await b.eval(`[...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent).join('|')`);
  rep.check("incluye datos estructurados (Product, COP, InStock)", /"@type":"Product"/.test(ld) && /"priceCurrency":"COP"/.test(ld) && /InStock/.test(ld));
  rep.check("sin errores de JavaScript en el navegador", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));

  // Registro de consultas (sin datos personales).
  const pid = psql(`select id from products where source_product_id = 'E2E-M1'`);
  const ok = await fetch(`${base}/api/tienda/consulta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: pid }) });
  rep.check("registrar una consulta responde 204", ok.status === 204, String(ok.status));
  rep.check("la consulta queda guardada solo con producto y hora", psql(`select count(*) from product_inquiries where product_id = '${pid}'`) === "1");
  const bad = await fetch(`${base}/api/tienda/consulta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: "no-es-uuid" }) });
  rep.check("un id inválido se rechaza (400)", bad.status === 400);
  const ghost = await fetch(`${base}/api/tienda/consulta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: "00000000-0000-4000-8000-000000000000" }) });
  rep.check("un producto inexistente no se registra (404)", ghost.status === 404);

  // Cron protegido.
  const cron = await fetch(`${base}/api/cron/catalog-sync`);
  rep.check("el cron de sincronización no responde sin secreto", [401, 503].includes(cron.status), String(cron.status));
  const cron2 = await fetch(`${base}/api/cron/catalog-sync`, { headers: { Authorization: "Bearer secreto-incorrecto-1234567890" } });
  rep.check("ni con un secreto incorrecto", [401, 503].includes(cron2.status), String(cron2.status));

  // ---------------------------------------------------------------- disponibilidad: stock 0, desaparición, regreso
  const hidePid = psql(`select id from products where source_product_id = 'E2E-D1'`);
  const slug = psql(`select slug from products where source_product_id = 'E2E-D1'`);
  const live = (await fetch(`${base}/tienda/producto/${slug}`)).status;
  rep.check("el disco está publicado (200) antes de agotarse", live === 200, String(live));
  sync(catalog({ disk: { stock: 0 } }));
  rep.check("stock 0: la ficha pública deja de existir (404) y el producto no se borra", (await fetch(`${base}/tienda/producto/${slug}`)).status === 404 && psql(`select count(*) from products where id = '${hidePid}'`) === "1");
  await b.goto("/tienda/categoria/almacenamiento", 1200);
  rep.check("stock 0: desaparece de categorías y búsquedas (la categoría queda sin productos visibles)", /no se encontr|404|no existe/i.test(await b.text()));
  const sm = await (await fetch(`${base}/sitemap.xml`)).text();
  rep.check("stock 0: tampoco aparece en el sitemap", !sm.includes(slug));
  sync(catalog());
  rep.check("al volver con stock reaparece (200)", (await fetch(`${base}/tienda/producto/${slug}`)).status === 200);
  sync(catalog().filter((x) => x.source_product_id !== "E2E-D1"));
  rep.check("si la fuente deja de listarlo se oculta (404) sin borrarlo y con motivo", (await fetch(`${base}/tienda/producto/${slug}`)).status === 404 && psql(`select deactivation_reason from product_source where product_id = '${hidePid}'`) === "missing_from_source");
  psql(`update products set is_active = false where id = '${hidePid}'`);
  sync(catalog());
  rep.check("ocultar a mano prevalece: la fuente lo ofrece de nuevo y sigue sin mostrarse (404)", (await fetch(`${base}/tienda/producto/${slug}`)).status === 404 && psql(`select source_available from products where id = '${hidePid}'`) === "t");
  psql(`update products set is_active = true where id = '${hidePid}'`);

  // Fallos de la fuente: no se vacía la tienda.
  const empty = JSON.parse(sync([]));
  rep.check("una fuente vacía se rechaza y NO oculta el catálogo", empty.status === "error" && psql(`select count(*) from products where source = 'EXCELENTER' and source_available`) === "29");
  rep.check("el rechazo queda registrado para el administrador", psql(`select count(*) from catalog_sync_runs where status = 'error'`) !== "0");

  // Un producto de proveedor jamás entra a un pedido.
  const cust = psql(`select c.id from customers c join profiles p on p.id = c.profile_id where p.email = '${state.client.email}'`);
  let blocked = false;
  try {
    psql(`with o as (insert into orders (customer_id, delivery_method) values ('${cust}', 'pickup_store') returning id) insert into order_items (order_id, product_id, description, qty, unit_price) select o.id, '${pid}', 'x', 1, 1000 from o;`);
  } catch {
    blocked = true;
  }
  rep.check("un producto de proveedor no se puede agregar a un pedido (sin cobro por Mercado Pago)", blocked);

  // ---------------------------------------------------------------- administración
  const o = await staffLogin(b, state.owner);
  state.owner.secret = o.secret;
  save();
  await b.viewport(1440, 900);
  await b.goto("/b/tienda", 2500);
  t = await b.text();
  rep.check("SUPERADMIN ve productos con precio fuente y precio TechnoUltra", /Fuente \$100\.000/.test(t) && /\$120\.000/.test(t) && /Excelenter/.test(t));
  await b.goto("/b/tienda?estado=sin_stock", 1500);
  rep.check("el filtro de estado funciona", /0 producto|No hay productos con esos filtros/.test(await b.text()));
  await b.goto(`/b/tienda/${pid}`, 2000);
  t = await b.text();
  rep.check("la ficha administrativa distingue estado de la fuente, visibilidad y resultado público", /Disponibilidad en la fuente/i.test(t) && /Visibilidad TechnoUltra/i.test(t) && /Resultado público/i.test(t) && /Se muestra en la tienda/.test(t));
  rep.check("el precio, el nombre y la categoría son de solo lectura (no hay formulario de edición)", !(await b.eval(`!!document.querySelector('input[name="price"]')`)) && !(await b.eval(`!!document.querySelector('input[name="name"]')`)));
  await b.goto("/b/tienda/sincronizacion", 2000);
  t = await b.text();
  rep.check("el historial de sincronizaciones muestra corridas con su estado", /Historial de sincronizaciones/.test(t) && /Exitoso/.test(t) && /Error/.test(t));
  rep.check("muestra las consultas por WhatsApp sin datos personales", /Productos con más consultas/.test(t) && /Mouse E2E inalámbrico/.test(t));
  await b.clickText("Sincronizar ahora", "main, #contenido");
  await b.waitText(/fuente automática aún no está configurada|No fue posible actualizar/, 15000);
  rep.check("«Sincronizar ahora» sin fuente configurada informa con claridad y no toca el catálogo", /aún no está configurada|No fue posible/.test(await b.text()) && psql(`select count(*) from products where source = 'EXCELENTER' and source_available`) === "29");

  // El técnico no administra la tienda.
  await b.clearCookies();
  const tc = await staffLogin(b, state.tech);
  state.tech.secret = tc.secret;
  save();
  await b.goto("/b/tienda/sincronizacion", 2000);
  rep.check("un técnico no entra a la sincronización del catálogo", !/Historial de sincronizaciones/.test(await b.text()) && !(await b.path()).startsWith("/b/tienda"));
  await b.goto("/b/tienda", 1500);
  rep.check("ni a la administración de la tienda", !/Sincronización/.test(await b.text()));
}
