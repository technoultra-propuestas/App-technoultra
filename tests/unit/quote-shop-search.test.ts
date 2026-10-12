import { beforeEach, describe, expect, it, vi } from "vitest";
import { accentPattern, queryWord, rankHits, searchTerm, type StaffProductHit } from "@/lib/catalog/staff-search";
import { balanceOpen, parseQuoteSummary, quotePayStage } from "@/lib/payments/quote-plan";

const hit = (o: Partial<StaffProductHit>): StaffProductHit => ({ id: o.name ?? "x", name: "Producto", brand: null, ref: null, price: 1000, image: null, available: true, ...o });

describe("buscador de productos para cotizar", () => {
  it("limpia el término y exige al menos 2 letras", () => {
    expect(searchTerm("  a ")).toBeNull();
    expect(searchTerm("ssd%_ 480,()")).toBe("ssd 480");
  });
  it("el patrón tolera acentos y mayúsculas (las vocales y la ñ son comodín de un carácter)", () => {
    expect(accentPattern("batería")).toBe("b_t_r__");
    expect(accentPattern("BATERIA")).toBe("B_T_R__");
    expect(accentPattern("ssd")).toBe("ssd");
    expect(queryWord("ssd kingston 480")).toBe("kingston");
  });
  it("filtra exacto sin acentos y ordena por relevancia: referencia > empieza por > contiene; agotados al final", () => {
    const hits = [
      hit({ name: "Cable SATA batería", brand: "Genérico" }),
      hit({ name: "Batería portátil Lenovo", brand: "Lenovo" }),
      hit({ name: "Batería HP agotada", available: false }),
      hit({ name: "Bota de lluvia" }), // coincide con el comodín «b_t_r__»? no: no contiene «bateria»
      hit({ name: "Kit", ref: "BATERIA" }),
    ];
    const out = rankHits(hits, "bateria").map((h) => h.name);
    expect(out[0]).toBe("Kit"); // referencia exacta
    expect(out[1]).toBe("Batería portátil Lenovo");
    expect(out).toContain("Cable SATA batería");
    expect(out.at(-1)).toBe("Batería HP agotada");
    expect(out).not.toContain("Bota de lluvia");
  });
  it("varias palabras: deben estar todas (en nombre, marca o referencia)", () => {
    const hits = [hit({ name: "SSD 480 GB", brand: "Kingston" }), hit({ name: "SSD 480 GB", brand: "Adata", id: "b" })];
    expect(rankHits(hits, "kingston ssd").map((h) => h.brand)).toEqual(["Kingston"]);
  });
});

const summary = (o: Record<string, unknown> = {}) =>
  parseQuoteSummary({
    status: "approved", code: "COT-1", version: 1, items_total: 559600, diagnosis_credit: 39900, base: 519700, paid: 0, discount: 0, balance: 519700,
    plan: null, approved_count: 0, paid_in_full: false, deposit_amount: 259850, deposit_remaining: 259850, full_discount: 25985, full_amount: 493715,
    pending_plan: null, pending_amount: null, pending_provider: null, pending_since: null, can_choose: true, can_pay_balance: false, ticket_status: "awaiting_approval", ...o,
  })!;

describe("resumen del cobro de la cotización (viene de la base de datos)", () => {
  it("valida la forma y rechaza datos incompletos", () => {
    expect(parseQuoteSummary({ status: "approved" })).toBeNull();
    expect(summary().full_amount).toBe(493715);
  });
  it("etapas: elegir → en validación → anticipo pagado → liquidada; sin saldo → nada que cobrar", () => {
    expect(quotePayStage(summary())).toBe("choose");
    expect(quotePayStage(summary({ pending_plan: "deposit", pending_amount: 259850 }))).toBe("validating");
    expect(quotePayStage(summary({ approved_count: 1, paid: 259850, balance: 259850, plan: "deposit" }))).toBe("deposit_paid");
    expect(quotePayStage(summary({ approved_count: 1, paid: 493715, discount: 25985, balance: 0, paid_in_full: true, plan: "full" }))).toBe("paid");
    expect(quotePayStage(summary({ base: 0, balance: 0 }))).toBe("nothing");
  });
  it("el saldo se habilita al final (pruebas o listo), no mientras se repara", () => {
    const s = (st: string) => summary({ approved_count: 1, paid: 259850, balance: 259850, plan: "deposit", can_pay_balance: true, ticket_status: st });
    expect(balanceOpen(s("in_service"))).toBe(false);
    expect(balanceOpen(s("testing"))).toBe(true);
    expect(balanceOpen(s("ready"))).toBe(true);
  });
});

// ---------------------------------------------------------------- «Agregar a cotización» (acción del servidor, con la sesión del personal)
type Row = Record<string, unknown>;
const db: { product: Row | null; quote: Row | null; items: Row[]; inserts: Row[]; updates: Row[]; createdQuote: boolean } = { product: null, quote: null, items: [], inserts: [], updates: [], createdQuote: false };
const role = { value: "technician" as string };
vi.mock("@/lib/auth/session", () => ({
  assertRole: vi.fn(async (allowed: string[]) => {
    if (!allowed.includes(role.value)) throw new Error("forbidden");
    return { id: "u1", role: role.value };
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/documents/generate", () => ({ generateTicketDocument: vi.fn() }));
vi.mock("@/lib/email/outbox", () => ({ scheduleEmailFlush: vi.fn() }));
vi.mock("@/lib/observability", () => ({ reportActionError: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const result = () => {
        if (table === "products") return { data: db.product };
        if (table === "quotes") return { data: db.quote };
        if (table === "tickets") return { data: { customer_id: "c1" } };
        return { data: db.items[0] ?? null, count: db.items.length };
      };
      Object.assign(chain, {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => result(),
        single: async () => ({ data: (db.createdQuote = true) && { id: "q-new", status: "draft" }, error: null }),
        then: (r: (v: unknown) => void) => r({ ...result(), count: db.items.length }),
        insert: (row: Row) => {
          if (table === "quote_items") db.inserts.push(row);
          return table === "quotes" ? chain : Promise.resolve({ error: null });
        },
        update: (row: Row) => {
          db.updates.push(row);
          return { eq: async () => ({ error: null }) };
        },
      });
      return chain;
    },
  }),
}));

import { addShopProductToQuoteAction } from "@/app/b/tickets/quote-actions";
const form = (o: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("ticketId", "5b1c7f0e-8f3a-4f0e-9d6b-2a4b9d7e1c11");
  fd.set("productId", "6c1c7f0e-8f3a-4f0e-9d6b-2a4b9d7e1c12");
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

describe("«Agregar a cotización» desde las recomendaciones del Shop", () => {
  beforeEach(() => {
    Object.assign(db, { product: { id: "p1", name: "SSD 480 GB", is_active: true, source_available: true, warranty_days: 365 }, quote: { id: "q1", status: "draft" }, items: [], inserts: [], updates: [], createdQuote: false });
    role.value = "technician";
  });
  it("agrega el producto como concepto «producto», SIN enviar precio (lo fija el catálogo) y con su garantía", async () => {
    const r = await addShopProductToQuoteAction(null, form());
    expect(r).toMatchObject({ ok: true, message: "Agregado a la cotización." });
    expect(db.inserts[0]).toMatchObject({ kind: "product", concept: "product", product_id: "6c1c7f0e-8f3a-4f0e-9d6b-2a4b9d7e1c12", qty: 1, warranty_days: 365, warranty_kind: "product" });
    expect(db.inserts[0].unit_price).toBeNull();
  });
  it("si ya estaba, aumenta la cantidad en vez de duplicar la línea", async () => {
    db.items = [{ id: "i1", qty: 1 }];
    const r = await addShopProductToQuoteAction(null, form());
    expect(r.message).toMatch(/cantidad 2/);
    expect(db.inserts).toHaveLength(0);
    expect(db.updates[0]).toEqual({ qty: 2 });
  });
  it("cotización enviada/aprobada: no se modifica en silencio", async () => {
    db.quote = { id: "q1", status: "sent" };
    const r = await addShopProductToQuoteAction(null, form());
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/nueva versión/);
    expect(db.inserts).toHaveLength(0);
  });
  it("sin cotización: crea el borrador y agrega el producto", async () => {
    db.quote = null;
    const r = await addShopProductToQuoteAction(null, form());
    expect(r.ok).toBe(true);
    expect(db.createdQuote).toBe(true);
  });
  it("producto inactivo o agotado: no se agrega", async () => {
    db.product = { id: "p1", name: "X", is_active: true, source_available: false, warranty_days: 0 };
    expect((await addShopProductToQuoteAction(null, form())).ok).toBe(false);
    db.product = { id: "p1", name: "X", is_active: false, source_available: true, warranty_days: 0 };
    expect((await addShopProductToQuoteAction(null, form())).ok).toBe(false);
    expect(db.inserts).toHaveLength(0);
  });
  it("el cliente no puede usar la acción (autorización en el servidor)", async () => {
    role.value = "client";
    await expect(addShopProductToQuoteAction(null, form())).rejects.toThrow(/forbidden/);
  });
});
