// SHOP público (catálogo Excelenter): diseño responsive, categorías/subcategorías, carrito, WhatsApp, banner, disponibilidad y administración.
// Los datos de prueba se cargan SOLO en la base local, con el mismo motor de sincronización de producción (sync_catalog).
import { staffLogin } from "../lib/actors.mjs";
import { psql } from "../lib/fixtures.mjs";
import { sleep } from "../lib/browser.mjs";

export const title = "SHOP: catálogo público, carrito, WhatsApp, banner, disponibilidad y administración";

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
// Las lecturas públicas del catálogo se cachean (60 s en producción; 1 s en E2E con stale-while-revalidate). Tras cambiar datos por SQL se
// consulta de nuevo hasta que la caché se refresca (los cambios hechos por la interfaz o el cron invalidan la caché al instante).
const fresh = async (url) => {
  await fetch(url);
  await sleep(1300);
  await fetch(url);
  await sleep(900);
  return fetch(url);
};
// Con `loading.tsx` la página se transmite en streaming: un producto retirado responde 200 con la pantalla «no encontrado» y <meta noindex> (no 404 HTTP).
const gone = async (url) => {
  const r = await fresh(url);
  const tx = await r.text();
  return (r.status === 404 || /name="robots" content="noindex/.test(tx)) && !tx.includes("Disco E2E");
};
const clickAdd = (b, nth = 0) => b.eval(`(() => { const x = [...document.querySelectorAll('article button')].filter((e) => /\\+ Agregar/.test(e.innerText))[${nth}]; if (!x) return false; x.click(); return true; })()`);
const badge = (b) => b.eval(`(document.querySelector('a[href="/tienda/carrito"]')?.getAttribute('aria-label')) ?? ''`);
const subtotal = (b) => b.eval(`(() => { const m = document.querySelector('aside[aria-label=Resumen]').innerText.match(/Subtotal\\s*\\$([0-9.]+)/); return m ? Number(m[1].replace(/\\./g, '')) : 0; })()`);
const closeSheet = async (b) => {
  await b.eval(`[...document.querySelectorAll('[role=dialog] button')].find((x) => /Cerrar/.test(x.innerText))?.click()`);
  await sleep(300);
};

export async function run({ b, rep, state, save, base }) {
  // Limpieza solo en la base LOCAL: el historial de precios es inmutable por diseño, así que se desactivan los disparadores en esta sesión.
  psql(`set session_replication_role = replica;
        delete from public.product_inquiries; delete from public.order_items where product_id in (select id from public.products where source is not null);
        delete from public.product_price_history; delete from public.product_source; delete from public.products where source is not null; delete from public.catalog_sync_runs;
        delete from public.shop_banners;`);
  const r1 = JSON.parse(sync(catalog()));
  rep.check("la importación inicial crea los 29 productos sin errores", r1.status === "success" && r1.created === 29 && r1.errors === 0, JSON.stringify(r1));

  // ---------------------------------------------------------------- móvil · sin sesión
  await b.clearCookies();
  await b.viewport(390, 844, true);
  await b.goto("/tienda", 2500);
  let t = await b.text();
  rep.check("/tienda es pública (sin iniciar sesión) y la sección se llama SHOP", /SHOP/.test(t) && (await b.path()) === "/tienda");
  rep.check("móvil: los productos se ven de inmediato (la primera tarjeta empieza dentro de la primera pantalla)", await b.eval(`(() => { const a = document.querySelector('article'); return !!a && a.getBoundingClientRect().top < 820; })()`));
  rep.check("móvil: dos columnas y tarjetas compactas (≤ 340 px de alto)", await b.eval(`(() => { const a = [...document.querySelectorAll('article')].slice(0, 2); if (a.length < 2) return false; const r = a.map((x) => x.getBoundingClientRect()); return Math.abs(r[0].top - r[1].top) < 4 && r[0].left < r[1].left && r[0].height <= 340; })()`));
  rep.check("móvil: sin desbordes horizontales", await noOverflow(b));
  rep.check("precio TechnoUltra (+20 %) y «● Disponible» en las tarjetas; no se muestra el costo del proveedor", /\$120\.000/.test(t) && /● Disponible/.test(t) && !/\$100\.000/.test(t));
  rep.check("la franja «Envíos TechnoUltra» muestra $10.000 y $20.000 sin esconderlos", /Envíos TechnoUltra/.test(t) && /\$10\.000/.test(t) && /\$20\.000/.test(t) && /validación de dirección/.test(t));
  rep.check("las tarjetas ya NO tienen «Consultar por WhatsApp»: el botón es «+ Agregar»", !(await b.eval(`[...document.querySelectorAll('article a')].some((a) => a.href.startsWith('https://wa.me/'))`)) && /\+ Agregar/.test(t));
  rep.check("no hay Mercado Pago ni cobro en el Shop", !/Mercado Pago/i.test(t));
  rep.check("móvil: los filtros no ocupan la pantalla hasta que se abren", !(await b.eval(`!!document.querySelector('[role=dialog]')`)));
  await b.eval(`[...document.querySelectorAll('main button')].find((x) => /Filtros/.test(x.innerText))?.click()`);
  await sleep(500);
  rep.check("«Filtros» abre una hoja inferior con marca y precio", (await b.eval(`!!document.querySelector('[role=dialog]')`)) && /Precio mínimo/.test(await b.text()) && /Marca/.test(await b.text()));
  await closeSheet(b);
  rep.check("la hoja se cierra", !(await b.eval(`!!document.querySelector('[role=dialog]')`)));
  await b.eval(`[...document.querySelectorAll('main button')].find((x) => /Ordenar/.test(x.innerText))?.click()`);
  await sleep(500);
  rep.check("«Ordenar» ofrece las opciones de orden", /Precio: menor a mayor/.test(await b.text()) && /Destacados/.test(await b.text()));
  await closeSheet(b);
  const count = await b.eval(`document.querySelectorAll('article').length`);
  rep.check("pagina de 24 en 24 (no carga todo)", count === 24, String(count));
  await b.goto("/tienda?pagina=2", 1500);
  rep.check("la página 2 muestra el resto", /Página 2 de 2/.test(await b.text()));

  // ---------------------------------------------------------------- escritorio
  await b.viewport(1440, 900);
  await b.goto("/tienda", 2500);
  rep.check("escritorio: filtros a la izquierda y productos a la derecha", await b.eval(`(() => { const aside = document.querySelector('aside[aria-label=Filtros]'); const a = document.querySelector('article'); if (!aside || !a) return false; const ar = aside.getBoundingClientRect(); const pr = a.getBoundingClientRect(); return ar.width > 150 && ar.right <= pr.left + 1 && getComputedStyle(aside).display !== 'none'; })()`));
  rep.check("escritorio: la rejilla tiene 4 columnas", await b.eval(`(() => { const r = [...document.querySelectorAll('main article')].slice(0, 5).map((x) => Math.round(x.getBoundingClientRect().top)); return r.slice(0, 4).every((v) => Math.abs(v - r[0]) < 4) && r[4] > r[0]; })()`));
  rep.check("escritorio: sin desbordes horizontales", await noOverflow(b));
  await b.viewport(1366, 768);
  await b.goto("/tienda", 1500);
  rep.check("1366 px: sin desbordes y con filtros laterales", (await noOverflow(b)) && (await b.eval(`getComputedStyle(document.querySelector('aside[aria-label=Filtros]')).display !== 'none'`)));
  await b.viewport(390, 844, true);

  // ---------------------------------------------------------------- categorías y subcategorías (relación padre → hijo exacta)
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

  // ---------------------------------------------------------------- búsqueda, filtros y orden
  await b.goto("/tienda?q=procesador", 1500);
  rep.check("la búsqueda encuentra por nombre", /Procesador E2E/.test(await b.text()) && !/Mouse E2E/.test(await b.text()));
  await b.goto("/tienda?q=zzzzzz", 1500);
  rep.check("sin resultados muestra un estado vacío claro", /No encontramos productos/.test(await b.text()));
  await b.goto("/tienda?q=%25%27%3B--", 1500);
  rep.check("una búsqueda con caracteres de inyección no rompe la página", !/error|algo salió mal/i.test(await b.text()) && (await b.path()).startsWith("/tienda"));
  await b.goto("/tienda?min=100000&max=120000&orden=precio-desc", 1500);
  t = await b.text();
  rep.check("el filtro de precio se aplica en el servidor sobre el precio final ($100.000–$120.000)", /Mouse E2E inalámbrico/.test(t) && /Mouse E2E óptico/.test(t) && !/Teclado E2E/.test(t) && !/Procesador E2E/.test(t) && !/Zfunda/.test(t));

  // ---------------------------------------------------------------- ficha de producto
  await b.goto("/tienda?q=inal%C3%A1mbrico", 1500);
  const href = await b.eval(`document.querySelector('a[href^="/tienda/producto/"]').getAttribute('href')`);
  await b.goto(href, 2000);
  t = await b.text();
  const wa = await b.eval(`document.querySelector('a[href^="https://wa.me/"]').href`);
  const msg = decodeURIComponent(wa.split("?text=")[1] ?? "");
  rep.check("la ficha muestra producto, referencia, precio, «1 unidad disponible» y la advertencia", /Mouse E2E inalámbrico/.test(t) && /Referencia: E2E-M1/.test(t) && /\$120\.000/.test(t) && /1 unidad disponible/.test(t) && /sujetos a confirmación por WhatsApp/.test(t));
  rep.check("botón principal «Agregar al carrito» y secundario de consulta por WhatsApp", /Agregar al carrito/.test(t) && /Consultar este producto por WhatsApp/.test(t));
  rep.check("el mensaje de la ficha tiene producto, referencia y precio publicado, sin «precio actual»", wa.startsWith("https://wa.me/573183943465?text=") && msg.startsWith("Hola TechnoUltra 👋") && /Producto: Mouse E2E inalámbrico/.test(msg) && /Referencia: E2E-M1/.test(msg) && /Precio: \$120\.000/.test(msg) && /Cantidad: 1/.test(msg) && !/precio actual/i.test(msg) && /coordinar la entrega\?$/.test(msg));
  const ld = await b.eval(`[...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent).join('|')`);
  rep.check("incluye datos estructurados (Product, COP, InStock)", /"@type":"Product"/.test(ld) && /"priceCurrency":"COP"/.test(ld) && /InStock/.test(ld));

  // ---------------------------------------------------------------- carrito
  await b.eval(`localStorage.removeItem('technoultra-shop-cart-v2')`);
  await b.goto("/tienda", 2000);
  rep.check("el carrito empieza vacío", /vac[ií]o/i.test(await badge(b)));
  const added = (await clickAdd(b, 0)) && (await clickAdd(b, 1));
  await sleep(600);
  rep.check("«+ Agregar» suma el producto y el contador se actualiza", added && /2 productos/.test(await badge(b)), await badge(b));
  await b.goto("/tienda?pagina=2", 1500);
  rep.check("el carrito se mantiene al navegar", /2 productos/.test(await badge(b)), await badge(b));
  await b.goto("/tienda/carrito", 2500);
  t = await b.text();
  rep.check("«Tu carrito» lista los productos con su precio y el subtotal", /Tu carrito/.test(t) && /Subtotal/.test(t) && /\$[0-9.]+/.test(t));
  rep.check("muestra «Entrega sujeta a confirmación de ubicación» con las dos tarifas, sin inventar una", /Entrega sujeta a confirmación de ubicación/.test(t) && /Cali urbano: \$10\.000/.test(t) && /\$20\.000/.test(t));
  rep.check("ofrece «Comprar por WhatsApp» y «Seguir explorando el catálogo»", /Comprar por WhatsApp/.test(t) && /Seguir explorando el catálogo/.test(t));
  const sub1 = await subtotal(b);
  await b.eval(`document.querySelector('button[aria-label="Agregar una unidad"]').click()`);
  await sleep(600);
  const sub2 = await subtotal(b);
  rep.check("cambiar la cantidad recalcula el subtotal", sub2 > sub1 && sub1 > 0, `${sub1} → ${sub2}`);
  const cwa = await b.eval(`[...document.querySelectorAll('a')].find((a) => /Comprar por WhatsApp/.test(a.innerText)).href`);
  const cmsg = decodeURIComponent(cwa.split("?text=")[1] ?? "");
  rep.check("un solo mensaje con todos los productos, precios publicados, cantidades, subtotal y entrega pendiente", cwa.startsWith("https://wa.me/573183943465?text=") && /1\. /.test(cmsg) && /2\. /.test(cmsg) && /Cantidad: 2/.test(cmsg) && /Subtotal productos: \$/.test(cmsg) && /Entrega:\nPendiente de confirmar/.test(cmsg) && /Precio publicado: \$/.test(cmsg) && !/precio actual/i.test(cmsg), cmsg.slice(0, 160));
  await b.goto("/tienda/carrito", 2000);
  rep.check("el carrito sobrevive a recargar la página", /Subtotal/.test(await b.text()));
  await b.eval(`[...document.querySelectorAll('button')].filter((x) => /Eliminar/.test(x.innerText)).forEach((x) => x.click())`);
  await sleep(800);
  rep.check("se pueden quitar productos hasta dejarlo vacío", /Tu carrito está vacío/.test(await b.text()));
  rep.check("móvil: el carrito no desborda", await noOverflow(b));

  // ---------------------------------------------------------------- registro de consultas y cron
  const pid = psql(`select id from products where source_product_id = 'E2E-M1'`);
  const ok = await fetch(`${base}/api/tienda/consulta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: pid }) });
  rep.check("registrar una consulta responde 204 y queda solo producto + hora", ok.status === 204 && psql(`select count(*) from product_inquiries where product_id = '${pid}'`) === "1", String(ok.status));
  const bad = await fetch(`${base}/api/tienda/consulta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: "no-es-uuid" }) });
  rep.check("un id inválido se rechaza (400)", bad.status === 400);
  const cart = await (await fetch(`${base}/api/tienda/carrito?ids=${pid}`)).json();
  rep.check("la API del carrito devuelve nombre y precio vigentes (el navegador solo guarda ids)", cart.products?.[0]?.price === 120000 && cart.products[0].name === "Mouse E2E inalámbrico");
  const cron = await fetch(`${base}/api/cron/catalog-sync`);
  rep.check("el cron de sincronización no responde sin secreto", [401, 503].includes(cron.status), String(cron.status));

  // ---------------------------------------------------------------- banner administrable
  rep.check("sin banner activo no se muestra ninguno", !(await (await fresh(`${base}/tienda`)).text()).includes("Promo E2E"));
  psql(`insert into shop_banners (title, subtitle, cta_label, cta_href, is_active, priority) values ('Promo E2E', 'Subtítulo de prueba', 'Ver ofertas', '/tienda/categoria/componentes', true, 5)`);
  const withBanner = await (await fresh(`${base}/tienda`)).text();
  rep.check("un banner activo y vigente aparece con título, subtítulo y botón", withBanner.includes("Promo E2E") && withBanner.includes("Subtítulo de prueba") && withBanner.includes("Ver ofertas"));
  psql(`update shop_banners set is_active = false`);
  rep.check("al desactivarlo desaparece", !(await (await fresh(`${base}/tienda`)).text()).includes("Promo E2E"));
  psql(`update shop_banners set is_active = true, ends_at = now() - interval '1 hour', starts_at = now() - interval '2 hours'`);
  rep.check("un banner fuera de su ventana de fechas no se muestra", !(await (await fresh(`${base}/tienda`)).text()).includes("Promo E2E"));
  psql(`delete from shop_banners`);

  // ---------------------------------------------------------------- disponibilidad: stock 0, desaparición, regreso
  const hidePid = psql(`select id from products where source_product_id = 'E2E-D1'`);
  const slug = psql(`select slug from products where source_product_id = 'E2E-D1'`);
  rep.check("el disco está publicado (200) antes de agotarse", (await fresh(`${base}/tienda/producto/${slug}`)).status === 200);
  sync(catalog({ disk: { stock: 0 } }));
  rep.check("stock 0: la ficha pública deja de existir (no-encontrado + noindex, sin contenido del producto) y el producto no se borra", (await gone(`${base}/tienda/producto/${slug}`)) && psql(`select count(*) from products where id = '${hidePid}'`) === "1");
  // El sitemap se genera con la misma consulta pública (RLS): un producto sin stock no es visible para el público, por tanto no se lista.
  rep.check("stock 0: tampoco es visible para el público (el sitemap y el catálogo usan esa misma lectura)", psql(`begin; set local role anon; select count(*) from products where id = '${hidePid}'; commit;`).split(String.fromCharCode(10)).includes("0"));
  sync(catalog());
  rep.check("al volver con stock reaparece (200)", (await fresh(`${base}/tienda/producto/${slug}`)).status === 200);
  psql(`update products set is_active = false where id = '${hidePid}'`);
  sync(catalog());
  rep.check("ocultar a mano prevalece: la fuente lo ofrece de nuevo y sigue sin mostrarse (404)", (await gone(`${base}/tienda/producto/${slug}`)) && psql(`select source_available from products where id = '${hidePid}'`) === "t");
  psql(`update products set is_active = true where id = '${hidePid}'`);
  const empty = JSON.parse(sync([]));
  rep.check("una fuente vacía se rechaza y NO oculta el catálogo", empty.status === "error" && psql(`select count(*) from products where source = 'EXCELENTER' and source_available`) === "29");

  // Un producto de proveedor jamás entra a un pedido.
  const cust = psql(`select c.id from customers c join profiles p on p.id = c.profile_id where p.email = '${state.client.email}'`);
  let blocked = false;
  try {
    psql(`with o as (insert into orders (customer_id, delivery_method) values ('${cust}', 'pickup_store') returning id) insert into order_items (order_id, product_id, description, qty, unit_price) select o.id, '${pid}', 'x', 1, 1000 from o;`);
  } catch {
    blocked = true;
  }
  rep.check("un producto de proveedor no se puede agregar a un pedido (sin cobro en línea)", blocked);

  // ---------------------------------------------------------------- administración
  const o = await staffLogin(b, state.owner);
  state.owner.secret = o.secret;
  save();
  await b.viewport(1440, 900);
  await b.goto("/b/tienda", 2500);
  t = await b.text();
  rep.check("SUPERADMIN ve productos con precio fuente y precio TechnoUltra", /Fuente \$100\.000/.test(t) && /\$120\.000/.test(t) && /Excelenter/.test(t));
  await b.goto(`/b/tienda/${pid}`, 2000);
  t = await b.text();
  rep.check("la ficha administrativa distingue estado de la fuente, visibilidad y resultado público", /Disponibilidad en la fuente/i.test(t) && /Visibilidad TechnoUltra/i.test(t) && /Resultado público/i.test(t) && /Se muestra en la tienda/.test(t));
  rep.check("permite destacar el producto y ordenarlo", /Producto destacado en el Shop/.test(t));
  await b.goto("/b/tienda/shop", 2500);
  t = await b.text();
  rep.check("el CRM del Shop administra banner, textos, envío, WhatsApp y categorías", /Banner promocional/.test(t) && /Textos, envíos y WhatsApp/.test(t) && /Categorías del Shop/.test(t) && /Nuevo banner/.test(t));
  rep.check("muestra las tarifas editables de envío de productos", await b.eval(`!!document.querySelector('input[name=shippingUrbanFee]') && document.querySelector('input[name=shippingUrbanFee]').value === '10000'`));
  await b.goto("/b/tienda/sincronizacion", 2000);
  rep.check("el historial de sincronizaciones muestra corridas con su estado", /Historial de sincronizaciones/.test(await b.text()));

  // El técnico no administra la tienda.
  await b.clearCookies();
  const tc = await staffLogin(b, state.tech);
  state.tech.secret = tc.secret;
  save();
  await b.goto("/b/tienda/shop", 2000);
  rep.check("un técnico no entra a la administración del Shop", !/Banner promocional/.test(await b.text()) && !(await b.path()).startsWith("/b/tienda"));
  rep.check("sin errores de JavaScript en el navegador", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
}
