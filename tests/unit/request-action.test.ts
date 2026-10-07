import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  customer: { id: "cust-1" } as { id: string } | null,
  dup: null as null | { id: string; code: string },
  insertError: null as null | { message: string },
  ticket: { data: "ticket-1" as string | null, error: null as null | { code?: string; message: string } },
};
const inserts: unknown[] = [];
const updates: { table: string; values: unknown }[] = [];
const adminRpc = vi.fn(async (_n: string, _a: unknown) => state.ticket);
const allow = vi.fn(async () => true);

function builder(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "gte", "limit"]) q[m] = () => q;
  q.update = (values: unknown) => {
    updates.push({ table, values });
    return q;
  };
  q.maybeSingle = async () => ({ data: table === "customers" ? state.customer : state.dup });
  q.insert = (v: unknown) => {
    inserts.push(v);
    return { select: () => ({ single: async () => (state.insertError ? { data: null, error: state.insertError } : { data: { id: "req-1", code: "SOL-2026-00001" }, error: null }) }) };
  };
  return q;
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (t: string) => builder(t) }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: adminRpc, from: (t: string) => builder(t) }) }));
vi.mock("@/lib/auth/session", () => ({ assertRole: async () => ({ id: "profile-1", role: "client" }) }));
vi.mock("@/lib/auth/rate-limit", () => ({ allow: (...a: unknown[]) => allow(...(a as [])), TOO_MANY: "Demasiados intentos." }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { createRequestAction } from "@/app/c/solicitar/actions";

const S = "11111111-1111-4111-8111-111111111111";
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const good = { serviceId: S, modality: "remote", problem: "Mi computador no enciende" };

beforeEach(() => {
  vi.clearAllMocks();
  inserts.length = 0;
  updates.length = 0;
  state.customer = { id: "cust-1" };
  state.dup = null;
  state.insertError = null;
  state.ticket = { data: "ticket-1", error: null };
  allow.mockResolvedValue(true);
});

describe("solicitud con ticket automático", () => {
  it("crea la solicitud, genera el ticket en el servidor y lleva al cliente a «Solicitud recibida» con ambos datos", async () => {
    await expect(createRequestAction({ ok: false }, fd(good))).rejects.toThrow("REDIRECT:/c/solicitar/listo?c=SOL-2026-00001&t=ticket-1");
    expect(inserts).toHaveLength(1);
    expect(adminRpc).toHaveBeenCalledWith("auto_create_ticket", { p_request: "req-1" });
  });
  it("el diagnóstico preliminar de IA queda ligado a la solicitud y al ticket automático (el técnico lo ve y lo valida)", async () => {
    const aiId = "22222222-2222-4222-8222-222222222222";
    await expect(createRequestAction({ ok: false }, fd({ ...good, aiId }))).rejects.toThrow(/REDIRECT/);
    const ai = updates.filter((u) => u.table === "ai_diagnostics").map((u) => u.values);
    expect(ai).toContainEqual({ service_request_id: "req-1" });
    expect(ai).toContainEqual({ ticket_id: "ticket-1" });
  });
  it("sin ticket (servicio no técnico) no se intenta ligar la IA a un ticket inexistente", async () => {
    state.ticket = { data: null, error: { message: "service_not_technical" } };
    await expect(createRequestAction({ ok: false }, fd(good))).rejects.toThrow(/REDIRECT/);
    expect(updates.some((u) => (u.values as Record<string, unknown>).ticket_id !== undefined)).toBe(false);
  });
  it("lo que envíe el navegador (precio, total, estado, cliente) no llega a la base de datos", async () => {
    await expect(createRequestAction({ ok: false }, fd({ ...good, amount: "1", price: "1", total: "1", status: "approved", customer_id: "otro", customerId: "otro", ticketId: "x" }))).rejects.toThrow(/REDIRECT/);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.customer_id).toBe("cust-1");
    for (const k of ["amount", "price", "total", "status", "ticketId", "customerId"]) expect(row).not.toHaveProperty(k);
  });
  it("doble clic: una solicitud idéntica reciente se reutiliza (no se crea otra) y el ticket sigue siendo el mismo", async () => {
    state.dup = { id: "req-1", code: "SOL-2026-00001" };
    await expect(createRequestAction({ ok: false }, fd(good))).rejects.toThrow("t=ticket-1");
    expect(inserts).toHaveLength(0);
    expect(adminRpc).toHaveBeenCalledTimes(1);
  });
  it("si no se pudo crear el ticket, la solicitud queda registrada y el cliente avanza (el SUPERADMIN puede recibirla)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    state.ticket = { data: null, error: { code: "XX000", message: "boom" } };
    await expect(createRequestAction({ ok: false }, fd(good))).rejects.toThrow("REDIRECT:/c/solicitar/listo?c=SOL-2026-00001");
    err.mockRestore();
  });
  it("un servicio digital no genera ticket y no se registra como error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    state.ticket = { data: null, error: { code: "P0001", message: "service_not_technical" } };
    await expect(createRequestAction({ ok: false }, fd(good))).rejects.toThrow(/REDIRECT:\/c\/solicitar\/listo\?c=SOL/);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
  it("datos no válidos, límite de intentos y cliente sin ficha no crean nada", async () => {
    expect((await createRequestAction({ ok: false }, fd({ ...good, problem: "no" }))).ok).toBe(false);
    expect((await createRequestAction({ ok: false }, fd({ ...good, serviceId: "x" }))).ok).toBe(false);
    allow.mockResolvedValue(false);
    expect((await createRequestAction({ ok: false }, fd(good))).error).toMatch(/Demasiados/);
    allow.mockResolvedValue(true);
    state.customer = null;
    expect((await createRequestAction({ ok: false }, fd(good))).ok).toBe(false);
    expect(inserts).toHaveLength(0);
    expect(adminRpc).not.toHaveBeenCalled();
  });
});
