import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const OID = "ORD01M49SFQXVAVQGG19A6SF4GN05";
const TOKEN = "APP_USR-1111111111111111-000000-token-de-prueba-0000000000";
const db = { status: "pending" as string, provider: "mercadopago", external_id: OID as string | null };
const state = { configured: true, order: null as unknown, apply: "approved" as string, allow: true, allowMp: true };
const rpc = vi.fn(async () => {
  // apply_payment_event: solo "approved"/"rejected" cambian el estado; "amount_mismatch" y "noop" no.
  if (state.apply === "approved") db.status = "approved";
  if (state.apply === "rejected") db.status = "rejected";
  return { data: state.apply, error: null };
});
const fetchOrder = vi.fn(async (..._a: unknown[]) => state.order);
const flush = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "p1", status: db.status, provider: db.provider, external_id: db.external_id } }) }) }) }) }),
}));
vi.mock("@/lib/env.server", () => ({
  serverEnv: {
    mercadopago: () => {
      if (!state.configured) throw new Error("x");
      return { MERCADOPAGO_ACCESS_TOKEN: TOKEN, MERCADOPAGO_WEBHOOK_SECRET: "s".repeat(20) };
    },
  },
}));
vi.mock("@/lib/payments/mercadopago", async (orig) => ({ ...((await orig()) as object), fetchOrder: (...a: unknown[]) => fetchOrder(...a) }));
vi.mock("@/lib/email/outbox", () => ({ scheduleEmailFlush: () => flush() }));
vi.mock("@/lib/env.public", () => ({ getPublicEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.technoultra.com" }) }));
vi.mock("@/lib/auth/rate-limit", () => ({ allow: vi.fn(async (scope: string) => (scope === "pay-refresh-mp" ? state.allowMp : state.allow)) }));

// Sesión del cliente (RLS simulada): `rows` es lo que la base de datos le deja ver.
const session = { user: { id: "u1" } as { id: string } | null, rows: [] as { id: string; status: string; provider: string; created_at: string; purpose: string }[] };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.user } }) },
    from: () => {
      const rows = () => session.rows.map((r) => ({ ...r, status: r.id === "p1" ? db.status : r.status }));
      return { select: () => ({ eq: () => Object.assign(Promise.resolve({ data: rows() }), { order: async () => ({ data: rows() }) }) }) };
    },
  }),
}));

import { POST } from "@/app/api/pagos/estado/route";
import { refreshPaymentStatus } from "@/lib/payments/refresh";

const order = (over: Record<string, unknown> = {}) => ({ id: OID, status: "processed", status_detail: "accredited", external_reference: "pay-p1", total_amount: "39900", total_paid_amount: "39900", currency: "COP", last_updated_date: "2026-10-11T10:00:00Z", integration_data: { application_id: "1111111111111111" }, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  db.status = "pending";
  db.provider = "mercadopago";
  db.external_id = OID;
  state.configured = true;
  state.order = order();
  state.apply = "approved";
  state.allow = true;
  state.allowMp = true;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("refreshPaymentStatus (verificación en el servidor)", () => {
  it("pendiente → el proveedor dice «acreditado» → se aplica por el camino seguro y queda aprobado", async () => {
    const r = await refreshPaymentStatus("p1");
    expect(r).toEqual({ status: "approved", verified: true, changed: true });
    expect(fetchOrder).toHaveBeenCalledWith(OID, TOKEN);
    expect(rpc).toHaveBeenCalledWith("apply_payment_event", expect.objectContaining({ p_status: "approved", p_amount: 39900, p_currency: "COP", p_external_reference: "pay-p1", p_event_type: "order.processed" }));
  });

  it("el proveedor sigue sin resolver: el pago continúa PENDIENTE, nunca aprobado ni fallido", async () => {
    state.order = order({ status: "action_required", status_detail: "waiting_payment" });
    state.apply = "noop";
    const r = await refreshPaymentStatus("p1");
    expect(r).toEqual({ status: "pending", verified: true, changed: false });
    expect(rpc).toHaveBeenCalledWith("apply_payment_event", expect.objectContaining({ p_status: "pending" }));
  });

  it("rechazado por el proveedor → pasa a rechazado (se puede reintentar)", async () => {
    state.order = order({ status: "failed", status_detail: "rejected" });
    state.apply = "rejected";
    expect(await refreshPaymentStatus("p1")).toEqual({ status: "rejected", verified: true, changed: true });
  });

  it("la API del proveedor falla (error temporal): NO se cambia nada y se informa «sin verificar»", async () => {
    state.order = null;
    const r = await refreshPaymentStatus("p1");
    expect(r).toEqual({ status: "pending", verified: false, changed: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("Order inexistente o sin credenciales → sin verificar y sin cambios", async () => {
    state.order = "not_found";
    expect((await refreshPaymentStatus("p1"))?.verified).toBe(false);
    state.configured = false;
    expect(await refreshPaymentStatus("p1")).toEqual({ status: "pending", verified: false, changed: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("monto distinto al esperado: la base de datos lo rechaza y el pago NO se aprueba", async () => {
    state.order = order({ total_paid_amount: "100", total_amount: "100" });
    state.apply = "amount_mismatch";
    expect(await refreshPaymentStatus("p1")).toEqual({ status: "pending", verified: true, changed: false });
  });

  it("un pago ya final o manual no se consulta al proveedor", async () => {
    db.status = "approved";
    expect(await refreshPaymentStatus("p1")).toEqual({ status: "approved", verified: true, changed: false });
    db.status = "pending";
    db.provider = "manual";
    expect((await refreshPaymentStatus("p1"))?.changed).toBe(false);
    expect(fetchOrder).not.toHaveBeenCalled();
  });

  it("una Order de otra aplicación se ignora (no se aplica)", async () => {
    state.order = order({ integration_data: { application_id: "9999999999999999" } });
    expect(await refreshPaymentStatus("p1")).toEqual({ status: "pending", verified: false, changed: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/pagos/estado", () => {
  const call = (body: unknown = { ticketId: "5b1c7f0e-8f3a-4f0e-9d6b-2a4b9d7e1c11" }, origin: string | null = "https://app.technoultra.com") =>
    POST(new NextRequest("https://app.technoultra.com/api/pagos/estado", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }));
  const mine = [{ id: "p1", status: "pending", provider: "mercadopago", created_at: "2026-10-11T10:00:00Z", purpose: "diagnosis" }];

  beforeEach(() => {
    session.user = { id: "u1" };
    session.rows = mine;
  });

  it("origen ajeno o ausente → 403; sin sesión → 401; cuerpo inválido → 400; demasiadas consultas → 429", async () => {
    expect((await call(undefined, "https://evil.example")).status).toBe(403);
    expect((await call(undefined, null)).status).toBe(403);
    session.user = null;
    expect((await call()).status).toBe(401);
    session.user = { id: "u1" };
    expect((await call({ ticketId: "no-uuid" })).status).toBe(400);
    state.allow = false;
    expect((await call()).status).toBe(429);
    expect(fetchOrder).not.toHaveBeenCalled();
  });

  it("aislamiento: el ticket de OTRO cliente (RLS no devuelve filas) no consulta nada al proveedor ni revela si existe", async () => {
    session.rows = [];
    const r = await call();
    expect(await r.json()).toMatchObject({ ok: true, state: "none" });
    expect(fetchOrder).not.toHaveBeenCalled();
  });

  it("pendiente verificado como acreditado → responde «confirmed» (leído de la base de datos) y programa los avisos", async () => {
    const r = await call();
    expect(await r.json()).toMatchObject({ ok: true, state: "confirmed", verified: true, changed: true });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("pendiente y el proveedor sigue sin resolver → «validating», sin avisos", async () => {
    state.order = order({ status: "action_required", status_detail: "waiting_payment" });
    state.apply = "noop";
    expect(await (await call()).json()).toMatchObject({ state: "validating", verified: true, changed: false });
    expect(flush).not.toHaveBeenCalled();
  });

  it("la API falla → «validating» con verified:false (la pantalla dice «no pudimos verificar», no «fallido»)", async () => {
    state.order = null;
    expect(await (await call()).json()).toMatchObject({ state: "validating", verified: false });
  });

  it("consultas repetidas en segundos no martillan al proveedor (tope por pago)", async () => {
    state.allowMp = false;
    const out = await (await call()).json();
    expect(fetchOrder).not.toHaveBeenCalled();
    expect(out).toMatchObject({ state: "validating", verified: true });
  });
});
