/* Service worker de TechnoUltra.
 * Estrategia deliberadamente conservadora (datos privados):
 *  - NUNCA se guardan en caché páginas autenticadas, respuestas de API, documentos ni nada con cookies de sesión.
 *  - Solo se cachean recursos estáticos inmutables (/_next/static, íconos) y una página de "sin conexión".
 *  - Las navegaciones van siempre a la red; si falla, se muestra /offline.html.
 * La actualización es controlada: el SW nuevo espera hasta que la persona acepta "Actualizar" (mensaje SKIP_WAITING).
 */
const VERSION = "tu-sw-v3";
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

// ---- Notificaciones push (Web Push) ----
// El servidor envía solo título, un cuerpo genérico y una ruta INTERNA: nunca montos, direcciones ni datos del servicio.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 120) : "TechnoUltra";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  const tag = typeof data.tag === "string" ? data.tag : undefined;
  // Avisa a las ventanas abiertas (solo el tag, nada sensible) para que la app pueda sonar su timbre si la persona lo activó.
  const tell = self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => list.forEach((c) => c.postMessage({ type: "PUSH_RECEIVED", tag })));
  event.waitUntil(
    Promise.all([tell, self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body.slice(0, 160) : "Abre TechnoUltra para ver los detalles.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      requireInteraction: data.urgent === true,
      data: { url },
    })]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const target = new URL(typeof raw === "string" && raw.startsWith("/") ? raw : "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) return c.focus().then((w) => (w && "navigate" in w ? w.navigate(target) : undefined));
      }
      return self.clients.openWindow(target);
    }),
  );
});
