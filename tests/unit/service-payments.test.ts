import { beforeEach, describe, expect, it, vi } from "vitest";

const OID = "ORD01M49SFQXVAVQGG19A6SF4GN05";
const state = {
  role: "client",
  mp: true,
  rpc: { data: [{ payment_id: "p1", amount: "150000", title: "Cotización · COT-1", external_reference: "pay-p1", ticket_id: "t1" }] as unknown, error: null as null | { code?: string; message: string } },
  order: { id: OID, checkoutUrl: `https://www.mercadopago.com.co/checkout/v1/redirect?order_id=${OID}` } as { id: string; checkoutUrl: string } | null,
  pending: [{ id: "p1", external_id: OID }] as { id: string; external_id: string }[],
  fetched: { id: OID, status: "processed", status_detail: "accredited", external_reference: "pay-p1", total_amount: "150000", total_paid_amount: "150000", currency: "COP", last_updated_date: "2026-10-05T10:00:00Z", integration_data: { application_id: "6180208665021480" } } as unknown,
  apply: { data: "approved", error: null } as { data: unknown; error: null | { code?: string } },
};
const rpc = vi.fn(async (name: string) => (name === "begin_service_payment" ? state.rpc : state.apply));
const updates: unknown[] = [];
const admin = {
  rpc,
  from: () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "lt", "gt", "order"]) q[m] = () => q;
    q.update = (v: unknown) => {
      updates.push(v);
      return q;
    };
    q.limit = async () => ({ data: state.pending });
    return q;
  },
};
const createOrder = vi.fn(async (..._a: unknown[]) => state.order);
const fetchOrder = vi.fn(async (..._a: unknown[]) => state.fetched);
const cancelOrder = vi.fn(async (..._a: unknown[]) => true);
const allow = vi.fn(async () => true);

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("@/lib/env.public", () => ({ getPublicEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.technoultra.com" }) }));
vi.mock("@/lib/env.server", () => ({
  serverEnv: {
    mercadopago: () => {
      if (!state.mp) throw new Error("not_configured");
      return { MERCADOPAGO_ACCESS_TOKEN: "APP_USR-6180208665021480-061515-secreto-3474234217", MERCADOPAGO_WEBHOOK_SECRET: "secreto-de-prueba" };
    },
  },
}));
vi.mock("@/lib/payments/mercadopago", async (orig) => ({
  ...((await orig()) as object),
  createOrder: (...a: unknown[]) => createOrder(...a),
  fetchOrder: (...a: unknown[]) => fetchOrder(...a),
  cancelOrder: (...a: unknown[]) => cancelOrder(...a),
}));
vi.mock("@/lib/auth/rate-limit", () => ({ allow: (...a: unknown[]) => allow(...(a as [])), clientIp: async () => "1.2.3.4", TOO_MANY: "Demasiados intentos." }));
vi.mock("@/lib/auth/session", () => ({
  assertRole: async (allowed: string[]) => {
    if (!allowed.includes(state.role)) throw Object.assign(new Error("forbidden"), { status: 403 });
    return { id: "profile-1", role: state.role, email: "cliente@gmail.com" };
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { startServicePaymentAction } from "@/app/c/tickets/pay-actions";
import { reconcilePendingPayments } from "@/lib/payments/reconcile";

const T = "11111111-1111-4111-8111-111111111111";
const R = "22222222-2222-4222-8222-222222222222";
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const body = { kind: "quote", ticketId: T, ref: R };

beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
  state.role = "client";
  state.mp = true;
  state.rpc = { data: [{ payment_id: "p1", amount: "150000", title: "Cotización · COT-1", external_reference: "pay-p1", ticket_id: "t1" }], error: null };
  state.order = { id: OID, checkoutUrl: `https://www.mercadopago.com.co/checkout/v1/redirect?order_id=${OID}` };
  state.pending = [{ id: "p1", external_id: OID }];
  state.fetched = { id: OID, status: "processed", status_detail: "accredited", external_reference: "pay-p1", total_amount: "150000", total_paid_amount: "150000", currency: "COP", last_updated_date: "2026-10-05T10:00:00Z", integration_data: { application_id: "6180208665021480" } };
  state.apply = { data: "approved", error: null };
  allow.mockResolvedValue(true);
});

describe("pago en línea de diagnóstico y cotización (Orders API)", () => {
  it("el importe sale de la base de datos: lo que envíe el navegador (monto, actor) se ignora", async () => {
    await expect(startServicePaymentAction(fd({ ...body, amount: "1", unit_price: "1", actor: "otro-usuario", p_actor: "otro" }))).rejects.toThrow(/REDIRECT:https:\/\/www\.mercadopago\.com\.co/);
    expect(rpc).toHaveBeenCalledWith("begin_service_payment", { p_actor: "profile-1", p_kind: "quote", p_ref: R });
    const input = createOrder.mock.calls[0][0] as { items: { unit_price: number; quantity: number }[]; totalAmount: number; externalReference: string; backPath: string; idempotencyKey: string };
    expect(input.items).toEqual([expect.objectContaining({ unit_price: 150000, quantity: 1 })]);
    expect(input.totalAmount).toBe(150000);
    expect(input.externalReference).toBe("pay-p1");
    expect(input.idempotencyKey).toBe("ord-p1");
    expect(input.backPath).toBe(`/c/tickets/${T}`);
  });
  it("guarda el id de la Order en el pago para consultarla y conciliarla", async () => {
    await expect(startServicePaymentAction(fd(body))).rejects.toThrow(/REDIRECT/);
    expect(updates).toContainEqual({ external_id: OID });
  });
  it("sin credenciales de Mercado Pago no se crea nada: se informa y se vuelve al ticket", async () => {
    state.mp = false;
    await expect(startServicePaymentAction(fd(body))).rejects.toThrow(`REDIRECT:/c/tickets/${T}?pago=no_configurado`);
    expect(rpc).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });
  it("traduce los errores de la BD a resultados seguros (sin exponer mensajes internos)", async () => {
    for (const [msg, res] of [["quote_already_paid", "ya_pagado"], ["quote_not_payable", "no_disponible"], ["nothing_to_pay", "sin_saldo"], ["boom interno", "no_disponible"]] as const) {
      state.rpc = { data: null, error: { code: "P0001", message: msg } };
      await expect(startServicePaymentAction(fd(body))).rejects.toThrow(`REDIRECT:/c/tickets/${T}?pago=${res}`);
    }
    expect(createOrder).not.toHaveBeenCalled();
  });
  it("si Mercado Pago no crea la Order no se redirige a ningún pago", async () => {
    state.order = null;
    await expect(startServicePaymentAction(fd(body))).rejects.toThrow(`REDIRECT:/c/tickets/${T}?pago=error`);
    expect(updates).toHaveLength(0);
  });
  it("límite de intentos y cargas inválidas", async () => {
    allow.mockResolvedValue(false);
    await expect(startServicePaymentAction(fd(body))).rejects.toThrow(`?pago=limite`);
    expect(rpc).not.toHaveBeenCalled();
    allow.mockResolvedValue(true);
    for (const bad of [{ kind: "order", ticketId: T, ref: R }, { kind: "quote", ticketId: "no-uuid", ref: R }, { kind: "quote", ticketId: T, ref: "x" }, {}]) {
      await startServicePaymentAction(fd(bad as Record<string, string>));
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("solo un CLIENTE autenticado: técnico, SUPERADMIN o anónimo reciben 403", async () => {
    for (const role of ["technician", "superadmin"]) {
      state.role = role;
      await expect(startServicePaymentAction(fd(body))).rejects.toMatchObject({ status: 403 });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("conciliación con Mercado Pago (cron)", () => {
  it("consulta la Order por su id y aplica el estado real por el camino seguro (apply_payment_event)", async () => {
    const r = await reconcilePendingPayments();
    expect(r).toMatchObject({ configured: true, checked: 1, applied: 1 });
    expect(fetchOrder).toHaveBeenCalledWith(OID, expect.stringMatching(/^APP_USR-/));
    expect(rpc).toHaveBeenCalledWith("apply_payment_event", expect.objectContaining({ p_external_reference: "pay-p1", p_status: "approved", p_amount: 150000, p_currency: "COP", p_external_id: OID }));
  });
  it("cancela en Mercado Pago las Orders cuyo pago interno ya venció", async () => {
    const r = await reconcilePendingPayments();
    expect(cancelOrder).toHaveBeenCalledWith(OID, expect.any(String));
    expect(r.cancelled).toBe(1);
  });
  it("sin credenciales no hace nada; pendiente, inexistente o de otra aplicación no cambian nada; duplicados no cuentan", async () => {
    state.mp = false;
    expect(await reconcilePendingPayments()).toEqual({ configured: false, checked: 0, applied: 0, cancelled: 0 });
    state.mp = true;
    state.fetched = { id: OID, status: "created", external_reference: "pay-p1", total_amount: "150000", currency: "COP", integration_data: { application_id: "6180208665021480" } };
    state.apply = { data: "noop", error: null };
    expect((await reconcilePendingPayments()).applied).toBe(0);
    fetchOrder.mockResolvedValueOnce("not_found");
    expect((await reconcilePendingPayments()).applied).toBe(0);
    state.fetched = { id: OID, status: "processed", status_detail: "accredited", external_reference: "pay-p1", total_amount: "150000", total_paid_amount: "150000", currency: "COP", integration_data: { application_id: "999" } };
    rpc.mockClear();
    expect((await reconcilePendingPayments()).applied).toBe(0);
    expect(rpc).not.toHaveBeenCalled(); // Order de otra aplicación: ni siquiera se aplica
  });
  it("aprobado con importe cobrado distinto al esperado se envía con el monto real (la base de datos lo rechaza como amount_mismatch)", async () => {
    state.fetched = { id: OID, status: "processed", status_detail: "accredited", external_reference: "pay-p1", total_amount: "150000", total_paid_amount: "1000", currency: "COP", integration_data: { application_id: "6180208665021480" } };
    state.apply = { data: "amount_mismatch", error: null };
    await reconcilePendingPayments();
    expect(rpc).toHaveBeenCalledWith("apply_payment_event", expect.objectContaining({ p_amount: 1000, p_status: "approved" }));
  });
});
