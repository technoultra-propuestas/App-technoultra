/* Service worker de TechnoUltra.
 * Estrategia deliberadamente conservadora (datos privados):
 *  - NUNCA se guardan en caché páginas autenticadas, respuestas de API, documentos ni nada con cookies de sesión.
 *  - Solo se cachean recursos estáticos inmutables (/_next/static, íconos) y una página de "sin conexión".
 *  - Las navegaciones van siempre a la red; si falla, se muestra /offline.html.
 * La actualización es controlada: el SW nuevo espera hasta que la persona acepta "Actualizar" (mensaje SKIP_WAITING).
 */
const VERSION = "tu-sw-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/offline.css", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tu-sw-") && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

const isStaticAsset = (url) => url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // terceros (Supabase, Cloudinary, Mercado Pago): sin intervenir

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
  // Todo lo demás (API, Server Actions, documentos, datos) va directo a la red y no se almacena.
});
