import { describe, expect, it } from "vitest";
import { deliveryBlocksSend, deliveryNotice, ensureQuoteDelivery } from "@/lib/tickets/quote-delivery";

/** Cliente de Supabase simulado: `modality` del ticket, resultado del RPC y la cotización resultante. Registra los RPC llamados. */
function fake(o: { modality: string; rpcError?: string; fee?: number; city?: string }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  let fee = o.fee ?? 0;
  const sb = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: table === "tickets" ? { modality: o.modality } : { delivery_fee: fee, delivery_snapshot: { city: o.city ?? "Cali" } } }),
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (args.p_apply === false) fee = 0;
      return { error: o.rpcError && args.p_apply === true ? { message: o.rpcError } : null };
    },
  };
  return { sb: sb as never, calls };
}

describe("domicilio de la cotización (servidor): valor de la zona, concepto aparte, sin inventar", () => {
  it("ticket en el local o remoto: no aplica ningún domicilio y no llama a la base de datos", async () => {
    const { sb, calls } = fake({ modality: "store" });
    expect(await ensureQuoteDelivery(sb, "q1", "t1")).toEqual({ state: "not_applicable" });
    expect(calls).toHaveLength(0);
  });
  it("ticket a domicilio con tarifa configurada: se aplica el valor que calcula el servidor (el código no lo recibe del navegador)", async () => {
    const { sb, calls } = fake({ modality: "home", fee: 25000, city: "Palmira" });
    expect(await ensureQuoteDelivery(sb, "q1", "t1")).toEqual({ state: "applied", fee: 25000, city: "Palmira" });
    expect(calls).toEqual([{ fn: "set_quote_delivery", args: { p_quote: "q1", p_apply: true } }]); // solo ids y «aplicar»: nunca un importe
  });
  it("zona sin tarifa (0): NO se cobra un domicilio «gratis» en silencio: se revierte y se avisa al personal", async () => {
    const { sb, calls } = fake({ modality: "home", fee: 0, city: "Yumbo" });
    const d = await ensureQuoteDelivery(sb, "q1", "t1");
    expect(d).toEqual({ state: "missing_fee", city: "Yumbo" });
    expect(calls.map((c) => c.args.p_apply)).toEqual([true, false]);
    expect(deliveryNotice(d)).toMatch(/Yumbo no tiene tarifa de domicilio configurada.*Cobertura.*No se cobró ningún domicilio/);
  });
  it("sin dirección o fuera de cobertura: no se aplica ningún cargo y se explica", async () => {
    const a = await ensureQuoteDelivery(fake({ modality: "home", rpcError: "delivery_address_missing" }).sb, "q1", "t1");
    const b = await ensureQuoteDelivery(fake({ modality: "home", rpcError: "out_of_coverage" }).sb, "q1", "t1");
    expect(a.state).toBe("no_address");
    expect(b.state).toBe("out_of_coverage");
    expect(deliveryNotice(a)).toMatch(/no tiene una dirección/);
    expect(deliveryNotice(b)).toMatch(/fuera de cobertura/);
  });
  it("no se envía una cotización de un servicio a domicilio sin el domicilio, salvo cortesía explícita; el local no se ve afectado", async () => {
    expect(await deliveryBlocksSend(fake({ modality: "home", fee: 0 }).sb, "q1", "t1", false)).toMatch(/no incluye el domicilio/);
    expect(await deliveryBlocksSend(fake({ modality: "home", fee: 10000 }).sb, "q1", "t1", false)).toBeNull();
    expect(await deliveryBlocksSend(fake({ modality: "home", fee: 0 }).sb, "q1", "t1", true)).toBeNull();
    expect(await deliveryBlocksSend(fake({ modality: "store", fee: 0 }).sb, "q1", "t1", false)).toBeNull();
  });
});
