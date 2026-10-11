import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock("web-push", () => ({ default: { sendNotification: (...a: unknown[]) => sendNotification(...a), setVapidDetails: (...a: unknown[]) => setVapidDetails(...a) } }));

const rpc = vi.fn();
const deleted: string[] = [];
const subsByUser: Record<string, { id: string; endpoint: string; p256dh: string; auth_key: string }[]> = {};
const upserts: unknown[] = [];
const admin = {
  rpc: (...a: unknown[]) => rpc(...a),
  from: (table: string) => ({
    select: () => ({
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
