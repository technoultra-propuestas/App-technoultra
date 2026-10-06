import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  role: "client",
  mp: true,
  rpc: { data: [{ payment_id: "p1", amount: "150000", title: "Cotización · COT-1", external_reference: "pay-p1", ticket_id: "t1" }] as unknown, error: null as null | { code?: string; message: string } },
  pref: { id: "pref1", init_point: "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=pref1" } as { id: string; init_point: string } | null,
  pending: [{ id: "p1", external_reference: "pay-p1" }] as { id: string; external_reference: string }[],
  search: [{ id: 99, status: "approved", transaction_amount: 150000, currency_id: "COP", date_last_updated: "2026-10-05T10:00:00Z" }] as { id: number; status: string; transaction_amount: number; currency_id: string; date_last_updated?: string }[],
  apply: { data: "approved", error: null } as { data: unknown; error: null | { code?: string } },
};
const rpc = vi.fn(async (name: string) => (name === "begin_service_payment" ? state.rpc : state.apply));
const admin = {
  rpc,
  from: () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "lt", "gt", "order"]) q[m] = () => q;
    q.limit = async () => ({ data: state.pending });
    return q;
  },
};
const createPreference = vi.fn(async (..._a: unknown[]) => state.pref);
const searchPaymentsByReference = vi.fn(async (..._a: unknown[]) => state.search);
const allow = vi.fn(async () => true);

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("@/lib/env.public", () => ({ getPublicEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.technoultra.com" }) }));
vi.mock("@/lib/env.server", () => ({
  serverEnv: {
    mercadopago: () => {
      if (!state.mp) throw new Error("not_configured");
      return { MERCADOPAGO_ACCESS_TOKEN: "TEST-token-de-prueba", MERCADOPAGO_WEBHOOK_SECRET: "secreto-de-prueba" };
    },
  },
}));
vi.mock("@/lib/payments/mercadopago", async (orig) => ({
  ...((await orig()) as object),
  createPreference: (...a: unknown[]) => createPreference(...a),
  searchPaymentsByReference: (...a: unknown[]) => searchPaymentsByReference(...a),
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
  state.role = "client";
  state.mp = true;
  state.rpc = { data: [{ payment_id: "p1", amount: "150000", title: "Cotización · COT-1", external_reference: "pay-p1", ticket_id: "t1" }], error: null };
  state.pref = { id: "pref1", init_point: "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=pref1" };
  state.pending = [{ id: "p1", external_reference: "pay-p1" }];
  state.search = [{ id: 99, status: "approved", transaction_amount: 150000, currency_id: "COP", date_last_updated: "2026-10-05T10:00:00Z" }];
  state.apply = { data: "approved", error: null };
  allow.mockResolvedValue(true);
});

describe("pago en línea de diagnóstico y cotización", () => {
  it("el importe sale de la base de datos: lo que envíe el navegador (monto, actor) se ignora", async () => {
    await expect(startServicePaymentAction(fd({ ...body, amount: "1", unit_price: "1", actor: "otro-usuario", p_actor: "otro" }))).rejects.toThrow(/REDIRECT:https:\/\/www\.mercadopago\.com\.co/);
    expect(rpc).toHaveBeenCalledWith("begin_service_payment", { p_actor: "profile-1", p_kind: "quote", p_ref: R });
    const input = createPreference.mock.calls[0][0] as { items: { unit_price: number; quantity: number }[]; externalReference: string; backPath: string };
    expect(input.items).toEqual([expect.objectContaining({ unit_price: 150000, quantity: 1 })]);
    expect(input.externalReference).toBe("pay-p1");
    expect(input.backPath).toBe(`/c/tickets/${T}`);
  });
  it("sin credenciales de Mercado Pago no se crea nada: se informa y se vuelve al ticket", async () => {
    state.mp = false;
    await expect(startServicePaymentAction(fd(body))).rejects.toThrow(`REDIRECT:/c/tickets/${T}?pago=no_configurado`);
    expect(rpc).not.toHaveBeenCalled();
    expect(createPreference).not.toHaveBeenCalled();
  });
  it("traduce los errores de la BD a resultados seguros (sin exponer mensajes internos)", async () => {
    for (const [msg, res] of [["quote_already_paid", "ya_pagado"], ["quote_not_payable", "no_disponible"], ["nothing_to_pay", "sin_saldo"], ["boom interno", "no_disponible"]] as const) {
      state.rpc = { data: null, error: { code: "P0001", message: msg } };
      await expect(startServicePaymentAction(fd(body))).rejects.toThrow(`REDIRECT:/c/tickets/${T}?pago=${res}`);
    }
    expect(createPreference).not.toHaveBeenCalled();
  });
  it("si Mercado Pago no crea la preferencia no se redirige a ningún pago", async () => {
    state.pref = null;
    await expect(startServicePaymentAction(fd(body))).rejects.toThrow(`REDIRECT:/c/tickets/${T}?pago=error`);
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
  it("aplica el estado real por el camino seguro (apply_payment_event) con el monto del proveedor", async () => {
    const r = await reconcilePendingPayments();
    expect(r).toEqual({ configured: true, checked: 1, applied: 1 });
    expect(searchPaymentsByReference).toHaveBeenCalledWith("pay-p1", "TEST-token-de-prueba");
    expect(rpc).toHaveBeenCalledWith("apply_payment_event", expect.objectContaining({ p_external_reference: "pay-p1", p_status: "approved", p_amount: 150000, p_currency: "COP", p_signature_valid: true }));
  });
  it("sin credenciales no hace nada; pendientes o sin resultado no cambian nada; duplicados no cuentan", async () => {
    state.mp = false;
    expect(await reconcilePendingPayments()).toEqual({ configured: false, checked: 0, applied: 0 });
    state.mp = true;
    state.search = [{ id: 1, status: "in_process", transaction_amount: 150000, currency_id: "COP" }];
    expect((await reconcilePendingPayments()).applied).toBe(0);
    state.search = [];
    expect((await reconcilePendingPayments()).applied).toBe(0);
    state.search = [{ id: 1, status: "approved", transaction_amount: 150000, currency_id: "COP" }];
    state.apply = { data: "noop", error: null };
    expect((await reconcilePendingPayments()).applied).toBe(0);
  });
});
