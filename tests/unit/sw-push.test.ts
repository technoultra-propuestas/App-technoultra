import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

/**
 * Ejecuta el service worker REAL (public/sw.js) con un `self` simulado y le entrega eventos `push`, `notificationclick` y `pushsubscriptionchange`.
 * Demuestra qué hace NUESTRO código al recibir un push. NO demuestra que el servicio push del sistema operativo lo entregue ni que suene o vibre:
 * eso solo se comprueba en dispositivos reales.
 */
function loadSw() {
  const listeners: Record<string, (e: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const posted: unknown[] = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  const fetched: { url: string; init: RequestInit }[] = [];
  const clientList: { url: string; focus: () => Promise<{ navigate: (u: string) => Promise<void> }>; postMessage: (m: unknown) => void }[] = [];
  const subscribe = vi.fn(async () => ({ toJSON: () => ({ endpoint: "https://push.example/new", keys: { p256dh: "p".repeat(30), auth: "a".repeat(12) } }) }));
  const self = {
    location: { origin: "https://app.technoultra.com" },
    addEventListener: (t: string, fn: (e: unknown) => void) => (listeners[t] = fn),
    skipWaiting: vi.fn(),
    clients: {
      claim: async () => {},
      matchAll: async () => clientList,
      openWindow: async (u: string) => void opened.push(u),
    },
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }), pushManager: { subscribe } },
  };
  const caches = { open: async () => ({ addAll: async () => {}, put: async () => {} }), keys: async () => [], match: async () => undefined, delete: async () => true };
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => (fetched.push({ url, init }), { ok: true }));
  runInNewContext(readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8"), { self, caches, fetch: fetchMock, URL, Promise, Date, console });
  const waits: Promise<unknown>[] = [];
  const evt = (extra: Record<string, unknown> = {}) => ({ waitUntil: (p: Promise<unknown>) => void waits.push(p), ...extra });
  return { listeners, shown, posted, opened, navigated, fetched, clientList, subscribe, evt, flush: () => Promise.all(waits.splice(0)) };
}

const push = (payload: unknown) => ({ data: { json: () => payload } });

describe("service worker: notificación del sistema al recibir un push", () => {
  it("muestra título, mensaje, acción «Abrir» y la ruta interna; NO silencia (sin `silent`) y marca urgente solo lo de prioridad alta", async () => {
    const sw = loadSw();
    sw.listeners.push(sw.evt(push({ title: "Firma el acta de recepción", body: "Revisa y firma el acta de tu equipo.", url: "/c/documentos/d1", tag: "n1", urgent: true })));
    await sw.flush();
    expect(sw.shown).toHaveLength(1);
    const { title, options } = sw.shown[0];
    expect(title).toBe("Firma el acta de recepción");
    expect(options).toMatchObject({ body: "Revisa y firma el acta de tu equipo.", tag: "n1", requireInteraction: true, data: { url: "/c/documentos/d1" }, actions: [{ action: "open", title: "Abrir" }] });
    expect(options).not.toHaveProperty("silent"); // el sonido/vibración los decide el teléfono
    expect(Array.isArray(options.vibrate)).toBe(true);
    sw.listeners.push(sw.evt(push({ title: "Otro", url: "/c", urgent: false })));
    await sw.flush();
    expect(sw.shown[1].options.requireInteraction).toBe(false);
  });

  it("solo acepta rutas internas y recorta textos; sin datos válidos muestra un aviso genérico (nunca falla en silencio)", async () => {
    const sw = loadSw();
    sw.listeners.push(sw.evt(push({ title: "T".repeat(500), body: "B".repeat(500), url: "https://evil.example/phish" })));
    sw.listeners.push(sw.evt({ data: { json: () => { throw new Error("no json"); } } }));
    sw.listeners.push(sw.evt({}));
    await sw.flush();
    expect(sw.shown[0].title.length).toBeLessThanOrEqual(120);
    expect((sw.shown[0].options.body as string).length).toBeLessThanOrEqual(160);
    expect(sw.shown[0].options.data).toEqual({ url: "/" });
    expect(sw.shown.slice(1).every((s) => s.title === "TechnoUltra")).toBe(true);
  });

  it("avisa solo con el `tag` a las ventanas abiertas (para el timbre opcional); no envía datos del aviso", async () => {
    const sw = loadSw();
    const post = vi.fn();
    sw.clientList.push({ url: "https://app.technoultra.com/c", focus: async () => ({ navigate: async () => {} }), postMessage: post });
    sw.listeners.push(sw.evt(push({ title: "X", body: "secreto", url: "/c", tag: "n9" })));
    await sw.flush();
    expect(post).toHaveBeenCalledWith({ type: "PUSH_RECEIVED", tag: "n9" });
  });
});

describe("service worker: al tocar la notificación", () => {
  it("con una ventana abierta la enfoca y navega al destino; sin ventana abre una nueva (URL absoluta del propio sitio)", async () => {
    const sw = loadSw();
    const nav = vi.fn(async () => {});
    sw.clientList.push({ url: "https://app.technoultra.com/c/tickets", focus: async () => ({ navigate: nav }), postMessage: () => {} });
    const close = vi.fn();
    sw.listeners.notificationclick(sw.evt({ notification: { close, data: { url: "/c/documentos/d1" } } }));
    await sw.flush();
    expect(close).toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith("https://app.technoultra.com/c/documentos/d1");

    const sw2 = loadSw();
    sw2.listeners.notificationclick(sw2.evt({ notification: { close: () => {}, data: { url: "/b/tickets/t1" } }, action: "open" }));
    await sw2.flush();
    expect(sw2.opened).toEqual(["https://app.technoultra.com/b/tickets/t1"]);
  });

  it("jamás navega a otro dominio aunque el dato venga manipulado", async () => {
    const sw = loadSw();
    sw.listeners.notificationclick(sw.evt({ notification: { close: () => {}, data: { url: "https://evil.example/x" } } }));
    sw.listeners.notificationclick(sw.evt({ notification: { close: () => {}, data: { url: "//evil.example/x" } } }));
    await sw.flush();
    expect(sw.opened).toEqual(["https://app.technoultra.com/", "https://app.technoultra.com/"]);
  });
});

describe("service worker: suscripción renovada por el navegador", () => {
  it("se vuelve a suscribir con la misma clave y la registra en el servidor con la sesión (sin pedir permisos)", async () => {
    const sw = loadSw();
    sw.listeners.pushsubscriptionchange(sw.evt({ oldSubscription: { options: { applicationServerKey: new Uint8Array([1, 2, 3]) } } }));
    await sw.flush();
    expect(sw.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    expect(sw.fetched[0].url).toBe("/api/push/subscribe");
    expect(sw.fetched[0].init).toMatchObject({ method: "POST", credentials: "same-origin" });
  });
  it("sin clave anterior no hace nada (y no falla)", async () => {
    const sw = loadSw();
    sw.listeners.pushsubscriptionchange(sw.evt({ oldSubscription: null }));
    await sw.flush();
    expect(sw.subscribe).not.toHaveBeenCalled();
  });
});
