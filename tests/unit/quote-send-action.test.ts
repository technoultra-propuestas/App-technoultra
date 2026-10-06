import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { error: null as null | { code?: string; message: string } };
const rpc = vi.fn(async () => ({ error: state.error }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("@/lib/auth/session", () => ({ assertRole: async () => ({ id: "staff-1", role: "technician" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/outbox", () => ({ scheduleEmailFlush: vi.fn() }));

import { sendQuoteAction } from "@/app/b/tickets/quote-actions";

const T = "11111111-1111-4111-8111-111111111111";
const Q = "22222222-2222-4222-8222-222222222222";
const fd = () => {
  const f = new FormData();
  f.set("ticketId", T);
  f.set("quoteId", Q);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  state.error = null;
});

describe("«Enviar al cliente»: errores reales, claros y rastreables", () => {
  it("éxito: llama a send_quote solo con el id de la cotización (el total lo decide la base de datos)", async () => {
    const r = await sendQuoteAction({ ok: false }, fd());
    expect(r.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("send_quote", { p_quote: Q });
  });

  it("ticket en «Recibido»: explica qué hacer en lugar del mensaje genérico", async () => {
    state.error = { code: "P0001", message: "invalid_transition: received -> awaiting_approval" };
    const r = await sendQuoteAction({ ok: false }, fd());
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/debe estar «En diagnóstico» \(ahora está «Recibido»\)/);
    expect(r.error).not.toMatch(/No pudimos completar/);
  });

  it("error desconocido: mensaje genérico + referencia, y el error REAL queda en el registro del servidor sin datos sensibles", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    state.error = { code: "XX000", message: 'relation "internal_table" failed for ana@correo.com token=abc123def456ghi789' };
    const r = await sendQuoteAction({ ok: false }, fd());
    expect(r.error).toMatch(/^No pudimos completar la acción\. Inténtalo de nuevo\. \(Ref\. [0-9a-f]{8}\)$/);
    const ref = /Ref\. ([0-9a-f]{8})/.exec(r.error ?? "")?.[1];
    const line = String(log.mock.calls[0][0]);
    expect(line).toContain(ref);
    expect(line).toContain("XX000");
    expect(line).toContain("quote.send_quote");
    expect(line).not.toMatch(/ana@correo\.com|abc123def456ghi789/);
    log.mockRestore();
  });

  it("sin permiso: mensaje claro de permiso (no se oculta ni se convierte en éxito)", async () => {
    state.error = { code: "42501", message: "forbidden" };
    const r = await sendQuoteAction({ ok: false }, fd());
    expect(r).toEqual({ ok: false, error: "No tienes permiso para esta acción." });
  });

  it("cotización ya enviada (doble clic): se rechaza con el motivo, sin éxito falso", async () => {
    state.error = { code: "P0001", message: "quote_not_draft" };
    const r = await sendQuoteAction({ ok: false }, fd());
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ya no se puede editar/);
  });
});
