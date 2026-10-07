import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const OID = "ORD01M49SFQXVAVQGG19A6SF4GN05";
const SECRET = "whsec_test_1234567890";
const TOKEN = "APP_USR-6180208665021480-061515-secreto-3474234217";
const state = { configured: true, order: null as unknown, apply: "approved" as string, applyError: null as null | { code: string } };
const seen = new Set<string>();
const rpc = vi.fn(async (_n: string, p: Record<string, unknown>) => {
  if (state.applyError) return { data: null, error: state.applyError };
  const id = String(p.p_event_id);
  if (seen.has(id)) return { data: "duplicate", error: null };
  seen.add(id);
  return { data: state.apply, error: null };
});
const fetchOrder = vi.fn(async (..._a: unknown[]) => state.order);

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/email/outbox", () => ({ scheduleEmailFlush: vi.fn() }));
vi.mock("@/lib/env.server", () => ({
  serverEnv: {
    mercadopago: () => {
      if (!state.configured) throw new Error("x");
      return { MERCADOPAGO_ACCESS_TOKEN: TOKEN, MERCADOPAGO_WEBHOOK_SECRET: SECRET };
    },
  },
}));
vi.mock("@/lib/payments/mercadopago", async (orig) => ({ ...((await orig()) as object), fetchOrder: (...a: unknown[]) => fetchOrder(...a) }));

import { POST } from "@/app/api/webhooks/mercadopago/route";

const order = (over: Record<string, unknown> = {}) => ({ id: OID, status: "processed", status_detail: "accredited", external_reference: "pay-p1", total_amount: "30100", total_paid_amount: "30100", currency: "COP", last_updated_date: "2026-10-06T10:00:00Z", integration_data: { application_id: "6180208665021480" }, ...over });
const signed = (dataId = OID, ts = String(Date.now()), reqId = "req-1") => `ts=${ts},v1=${createHmac("sha256", SECRET).update(`id:${dataId.toLowerCase()};request-id:${reqId};ts:${ts};`).digest("hex")}`;
function call(opts: { body?: unknown; raw?: string; sig?: string | null; type?: string; dataId?: string } = {}) {
  const dataId = opts.dataId ?? OID;
  const headers: Record<string, string> = { "content-type": "application/json", "x-request-id": "req-1" };
  if (opts.sig !== null) headers["x-signature"] = opts.sig ?? signed(dataId);
  const body = opts.raw ?? JSON.stringify(opts.body ?? { type: opts.type ?? "order", action: "order.processed", data: { id: dataId } });
  return POST(new NextRequest(`https://app.technoultra.com/api/webhooks/mercadopago?data.id=${dataId.toLowerCase()}&type=${opts.type ?? "order"}`, { method: "POST", headers, body }));
}
const json = async (r: Response) => (await r.json()) as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  seen.clear();
  state.configured = true;
  state.order = order();
  state.apply = "approved";
  state.applyError = null;
});

describe("webhook de Mercado Pago (Orders)", () => {
  it("firma válida + Order consultada a la API → se aplica y se confirma", async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ result: "approved" });
    expect(fetchOrder).toHaveBeenCalledWith(OID, TOKEN);
    expect(rpc).toHaveBeenCalledWith("apply_payment_event", expect.objectContaining({ p_external_reference: "pay-p1", p_status: "approved", p_amount: 30100, p_currency: "COP", p_external_id: OID, p_event_type: "order.processed" }));
  });
  it("acepta la firma calculada con el id tal cual (mayúsculas), aunque la URL lo traiga en minúsculas", async () => {
    const ts = String(Date.now());
    const sig = `ts=${ts},v1=${createHmac("sha256", SECRET).update(`id:${OID};request-id:req-1;ts:${ts};`).digest("hex")}`;
    const r = await call({ sig });
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ result: "approved" });
  });
  it("sin firma, firma inválida o con otro secreto → 401 y NO se consulta ni se aplica nada", async () => {
    for (const sig of [null, "garbage", signed(OID, String(Date.now() - 5 * 24 * 3600_000)), `ts=${Date.now()},v1=${"a".repeat(64)}`]) {
      const r = await call({ sig });
      expect(r.status).toBe(401);
    }
    expect(fetchOrder).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("sin data.id → 401; cuerpo malformado → 401 (no hay forma de validar)", async () => {
    expect((await call({ raw: "{no es json", sig: null })).status).toBe(401);
    expect((await call({ body: { type: "order" }, sig: signed("x") })).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("sin credenciales configuradas el webhook se niega (503)", async () => {
    state.configured = false;
    expect((await call()).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("cuerpo excesivo → 413", async () => {
    expect((await call({ raw: JSON.stringify({ x: "a".repeat(20_000) }) })).status).toBe(413);
  });
  it("tipos que no son Order (p. ej. payment heredado) se reconocen sin cambiar nada", async () => {
    const r = await call({ type: "payment", dataId: "123456", sig: signed("123456") });
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ ignored: true });
    expect(fetchOrder).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("id con formato inválido, Order inexistente (404) o proveedor caído", async () => {
    expect(await json(await call({ dataId: "abc123", sig: signed("abc123") }))).toEqual({ ignored: true });
    state.order = "not_found";
    expect(await json(await call())).toEqual({ ignored: "order_not_found" });
    state.order = null;
    expect((await call()).status).toBe(502); // Mercado Pago reintenta
    expect(rpc).not.toHaveBeenCalled();
  });
  it("Order de otra aplicación, sin referencia o en otra moneda → ignorada, jamás aplicada", async () => {
    state.order = order({ integration_data: { application_id: "999" } });
    expect(await json(await call())).toEqual({ ignored: "foreign_application" });
    state.order = order({ external_reference: null });
    expect(await json(await call())).toEqual({ ignored: "no_reference" });
    state.order = order({ currency: "USD" });
    expect(await json(await call())).toEqual({ ignored: "bad_currency" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("aprobado con importe cobrado distinto: se envía el monto REAL y la base de datos lo rechaza", async () => {
    state.order = order({ total_paid_amount: "1000" });
    state.apply = "amount_mismatch";
    expect(await json(await call())).toEqual({ result: "amount_mismatch" });
    expect(rpc).toHaveBeenCalledWith("apply_payment_event", expect.objectContaining({ p_amount: 1000 }));
  });
  it("aprobado sin importe cobrado verificable → monto 0 (nunca coincide)", async () => {
    state.order = order({ total_paid_amount: undefined });
    await call();
    expect(rpc).toHaveBeenCalledWith("apply_payment_event", expect.objectContaining({ p_amount: 0 }));
  });
  it("estados no aprobados: pendiente, rechazado, cancelado y reembolsado se mapean sin aprobar", async () => {
    for (const [s, d, expected] of [["created", undefined, "pending"], ["processing", "in_process", "pending"], ["failed", "high_risk", "rejected"], ["canceled", "canceled", "cancelled"], ["refunded", "refunded", "refunded"]] as const) {
      seen.clear();
      state.order = order({ status: s, status_detail: d, total_paid_amount: undefined });
      await call();
      expect(rpc).toHaveBeenLastCalledWith("apply_payment_event", expect.objectContaining({ p_status: expected, p_amount: 30100 }));
    }
  });
  it("el mismo webhook 2, 5 y 10 veces: una sola aplicación, el resto 'duplicate'", async () => {
    for (const n of [2, 5, 10]) {
      seen.clear();
      const results: unknown[] = [];
      for (let i = 0; i < n; i++) results.push((await json(await call())).result);
      expect(results.filter((r) => r === "approved")).toHaveLength(1);
      expect(results.filter((r) => r === "duplicate")).toHaveLength(n - 1);
    }
  });
  it("llegadas simultáneas del mismo evento: solo una se aplica", async () => {
    const all = await Promise.all(Array.from({ length: 6 }, () => call()));
    const results = await Promise.all(all.map(async (r) => (await json(r)).result));
    expect(results.filter((r) => r === "approved")).toHaveLength(1);
  });
  it("error al aplicar → 500 sin detalle interno", async () => {
    state.applyError = { code: "XX000" };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await call();
    expect(r.status).toBe(500);
    expect(await json(r)).toEqual({ error: "apply_failed" });
    err.mockRestore();
  });
  it("lo que se guarda como carga del evento no incluye datos personales ni secretos", async () => {
    state.order = order({ payer: { email: "ana@correo.com", identification: { number: "123" } }, transactions: { payments: [{ id: "x", payment_method: { id: "visa", card: "4111" } }] } });
    await call();
    const payload = JSON.stringify((rpc.mock.calls[0][1] as { p_payload: unknown }).p_payload);
    expect(payload).not.toMatch(/ana@correo|identification|4111|visa|APP_USR|whsec/);
  });
});
