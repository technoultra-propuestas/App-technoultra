import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock("web-push", () => ({ default: { sendNotification: (...a: unknown[]) => sendNotification(...a), setVapidDetails: (...a: unknown[]) => setVapidDetails(...a) } }));

const rpc = vi.fn();
const deleted: string[] = [];
const subsByUser: Record<string, { id: string; endpoint: string; p256dh: string; auth_key: string }[]> = {};
const upserts: unknown[] = [];
let notifTypes: { id: string; type: string }[] = [];
const admin = {
  rpc: (...a: unknown[]) => rpc(...a),
  from: (table: string) => ({
    select: () => ({
      in: async () => ({ data: table === "notifications" ? notifTypes : [] }),
      eq: (_c: string, v: string) => {
        const res = { data: table === "push_subscriptions" ? (subsByUser[v] ?? []) : { role: v === "staff1" ? "technician" : "client" }, count: (subsByUser[v] ?? []).length };
        return Object.assign(Promise.resolve(res), { maybeSingle: async () => res });
      },
    }),
    update: () => ({ eq: async () => ({}) }),
    delete: () => ({ eq: (_c: string, v: string) => { deleted.push(v); return { eq: async () => ({}) , then: undefined }; } }),
    upsert: async (row: unknown) => { upserts.push({ table, row }); return { error: null }; },
  }),
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));

// Preferencias: update (sin fila previa) → insert. Registra lo escrito para verificar que el dueño sale de la sesión.
const user = {
  auth: { getUser: vi.fn() },
  from: () => ({
    update: (row: unknown) => ({ eq: () => ({ select: async () => { upserts.push({ table: "notification_preferences", row }); return { error: null, data: [{ profile_id: "x" }] }; } }) }),
    insert: async () => ({ error: null }),
  }),
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => user }));
vi.mock("@/lib/env.public", () => ({ getPublicEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.technoultra.com" }) }));

import { POST } from "@/app/api/push/subscribe/route";
import { flushPushOutbox } from "@/lib/push/send";

const claimed = (over: Record<string, unknown> = {}) => ({ notification_id: "n1", recipient_id: "u1", title: "Recibimos tu pago", body: "Monto $39.900 en Calle 5 #4-3", entity_type: "ticket", entity_id: "t1", priority: "high", attempt: 1, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  deleted.length = 0;
  upserts.length = 0;
  for (const k of Object.keys(subsByUser)) delete subsByUser[k];
  notifTypes = [];
  process.env.VAPID_PUBLIC_KEY = "B".repeat(87);
  process.env.VAPID_PRIVATE_KEY = "k".repeat(43);
  process.env.VAPID_SUBJECT = "mailto:studio@technoultra.com";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("envío push", () => {
  it("usuario SIN push: no se reclama nada y no se envía", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const r = await flushPushOutbox();
    expect(r).toMatchObject({ sent: 0, failed: 0, configured: true });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sin claves VAPID el push queda desactivado sin romper nada", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const r = await flushPushOutbox();
    expect(r).toMatchObject({ configured: false, sent: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("usuario CON push: envía al dispositivo, con contenido genérico (sin montos ni direcciones) y ruta interna", async () => {
    subsByUser.u1 = [{ id: "s1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }];
    rpc.mockResolvedValueOnce({ data: [claimed()], error: null }).mockResolvedValue({ data: null, error: null });
    sendNotification.mockResolvedValue({});
    const r = await flushPushOutbox();
    expect(r).toMatchObject({ sent: 1, failed: 0 });
    const payload = JSON.parse(sendNotification.mock.calls[0][1] as string);
    expect(payload.url).toBe("/c/tickets/t1");
    expect(payload.body).toBe("Abre TechnoUltra para ver los detalles.");
    expect(JSON.stringify(payload)).not.toMatch(/39\.900|Calle/);
    expect(rpc).toHaveBeenCalledWith("record_delivery", expect.objectContaining({ p_notification: "n1", p_channel: "push", p_status: "sent" }));
  });

  it("el aviso de firma pendiente lleva un texto fijo útil (qué hacer) y el del técnico/SUPERADMIN enlaza al ticket; ninguno trae datos personales", async () => {
    subsByUser.u1 = [{ id: "s1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }];
    subsByUser.staff1 = [{ id: "s2", endpoint: "https://push.example/2", p256dh: "p", auth_key: "a" }];
    notifTypes = [{ id: "n1", type: "document.sign_pending" }, { id: "n2", type: "document.signed_staff" }];
    rpc
      .mockResolvedValueOnce({ data: [claimed({ title: "Firma el acta de recepción", entity_type: "document", entity_id: "d1" }), claimed({ notification_id: "n2", recipient_id: "staff1", title: "Firmada: acta de recepción TU-2026-00006", entity_type: "ticket", entity_id: "t9" })], error: null })
      .mockResolvedValue({ data: null, error: null });
    sendNotification.mockResolvedValue({});
    await flushPushOutbox();
    const [a, b] = sendNotification.mock.calls.map((c) => JSON.parse(c[1] as string));
    expect(a).toMatchObject({ title: "Firma el acta de recepción", body: "Revisa y firma el acta de tu equipo.", url: "/c/documentos/d1", urgent: true, tag: "n1" });
    expect(b).toMatchObject({ body: "El cliente firmó el acta. Toca para ver el ticket.", url: "/b/tickets/t9", tag: "n2" });
    expect(JSON.stringify([a, b])).not.toMatch(/39\.900|Calle|@/);
  });

  it("con dos dispositivos, uno caducado (410) y otro vigente: se entrega por el vigente, se elimina el caducado y NO se cuenta como fallo", async () => {
    subsByUser.u1 = [{ id: "dead", endpoint: "https://push.example/dead", p256dh: "p", auth_key: "a" }, { id: "live", endpoint: "https://push.example/live", p256dh: "p", auth_key: "a" }];
    rpc.mockResolvedValueOnce({ data: [claimed()], error: null }).mockResolvedValue({ data: null, error: null });
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("dead")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      return {};
    });
    const r = await flushPushOutbox();
    expect(r).toMatchObject({ sent: 1, failed: 0, removed: 1 });
    expect(deleted).toEqual(["dead"]);
  });

  it("con un acumulado de avisos antiguos, el envío vacía la cola por lotes: el aviso NUEVO no queda sin enviar", async () => {
    subsByUser.u1 = [{ id: "s1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }];
    rpc
      .mockResolvedValueOnce({ data: [claimed({ notification_id: "viejo" })], error: null })
      .mockResolvedValueOnce({ data: [], error: null }) // record_delivery del primero
      .mockResolvedValueOnce({ data: [claimed({ notification_id: "nuevo", title: "Firmada: acta de recepción TU-1" })], error: null })
      .mockResolvedValue({ data: [], error: null });
    sendNotification.mockResolvedValue({});
    const r = await flushPushOutbox(1);
    expect(r.sent).toBe(2);
    const tags = sendNotification.mock.calls.map((c) => JSON.parse(c[1] as string).tag);
    expect(tags).toEqual(["viejo", "nuevo"]);
  });

  it("el personal recibe rutas del panel, no del cliente", async () => {
    subsByUser.staff1 = [{ id: "s2", endpoint: "https://push.example/2", p256dh: "p", auth_key: "a" }];
    rpc.mockResolvedValueOnce({ data: [claimed({ recipient_id: "staff1" })], error: null }).mockResolvedValue({ data: null, error: null });
    sendNotification.mockResolvedValue({});
    await flushPushOutbox();
    expect(JSON.parse(sendNotification.mock.calls[0][1] as string).url).toBe("/b/tickets/t1");
  });

  it("un fallo NO se oculta: se registra como fallido y una suscripción caducada (410) se elimina", async () => {
    subsByUser.u1 = [{ id: "s1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }];
    rpc.mockResolvedValueOnce({ data: [claimed()], error: null }).mockResolvedValue({ data: null, error: null });
    sendNotification.mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));
    const r = await flushPushOutbox();
    expect(r).toMatchObject({ sent: 0, failed: 1, removed: 1 });
    expect(deleted).toContain("s1");
    expect(rpc).toHaveBeenCalledWith("record_delivery", expect.objectContaining({ p_status: "failed", p_error: "push_410" }));
  });
});

describe("POST /api/push/subscribe", () => {
  const body = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p".repeat(30), auth: "a".repeat(12) } };
  const req = (b: unknown, origin: string | null = "https://app.technoultra.com") =>
    new NextRequest("https://app.technoultra.com/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(b) });

  it("sin sesión → 401", async () => {
    user.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(req(body))).status).toBe(401);
  });

  it("origen distinto o ausente → 403 (CSRF)", async () => {
    user.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    expect((await POST(req(body, "https://evil.example"))).status).toBe(403);
    expect((await POST(req(body, null))).status).toBe(403);
  });

  it("suscripción inválida (no https / sin claves) → 400", async () => {
    user.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    expect((await POST(req({ endpoint: "http://x.example", keys: body.keys }))).status).toBe(400);
    expect((await POST(req({ endpoint: body.endpoint }))).status).toBe(400);
  });

  it("el dueño del dispositivo es SIEMPRE el usuario de la sesión, aunque el cuerpo diga otro", async () => {
    user.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(req({ ...body, profile_id: "victima" }));
    expect(res.status).toBe(200);
    const dev = upserts.find((u) => (u as { table: string }).table === "push_subscriptions") as { row: { profile_id: string } };
    expect(dev.row.profile_id).toBe("u1");
    expect(upserts.some((u) => (u as { table: string; row: { push_enabled?: boolean } }).table === "notification_preferences" && (u as { row: { push_enabled?: boolean } }).row.push_enabled === true)).toBe(true);
  });
});
