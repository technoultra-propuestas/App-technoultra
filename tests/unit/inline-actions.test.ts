import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db: { customer: { id: string } | null; recentEquipment: Row[]; recentAddresses: Row[]; inserted: { table: string; row: Row }[]; allowed: boolean; count: number } = {
  customer: { id: "cust-A" },
  recentEquipment: [],
  recentAddresses: [],
  inserted: [],
  allowed: true,
  count: 0,
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ assertRole: vi.fn(async () => ({ id: "profile-A", role: "client" })) }));
vi.mock("@/lib/auth/rate-limit", () => ({ allow: vi.fn(async () => db.allowed), TOO_MANY: "Demasiados intentos." }));
vi.mock("@/lib/tickets/zone", () => ({
  loadZones: vi.fn(async (_s: unknown, danes: string[]) => new Map(danes.map((d) => [d, { dane: d, city: "Cali", covered: { store: true, home: true }, homeFee: 10000, pickupFee: 0 }]))),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        is: () => q,
        eq: () => q,
        gte: () => Promise.resolve({ data: table === "equipment" ? db.recentEquipment : db.recentAddresses }),
        maybeSingle: async () => ({ data: table === "customers" ? db.customer : null }),
        insert: (row: Row) => ({
          select: () => ({
            single: async () => {
              db.inserted.push({ table, row });
              return { data: { id: `new-${table}`, type: row.type, brand: row.brand, model: row.model, label: row.label, line1: row.line1, neighborhood: row.neighborhood ?? null, city_name: row.city_name, dane_code: row.dane_code }, error: null };
            },
          }),
        }),
        then: undefined,
      });
      // `select(..., { head: true, count })` de direcciones: cuenta de direcciones existentes
      Object.assign(q, { select: (_c?: unknown, o?: { head?: boolean }) => (o?.head ? { is: async () => ({ count: db.count }) } : q) });
      return q;
    },
  }),
}));
vi.mock("@/lib/domain/address", async (orig) => {
  const real = await orig<typeof import("@/lib/domain/address")>();
  return {
    ...real,
    resolveAddressPlace: vi.fn(async (_s: unknown, v: { dane: string; otherCity?: string }) =>
      v.dane === "other" ? { ok: true, city_name: v.otherCity ?? "Otra", department: "Otro", dane_code: "00000" } : { ok: true, city_name: "Cali", department: "Valle del Cauca", dane_code: v.dane }),
  };
});

import { quickCreateAddress, quickCreateEquipment } from "@/app/c/solicitar/inline-actions";

const laptop = { type: "laptop", brand: "Lenovo", model: "ThinkPad E14", serial: "", ram: "", storage: "", year: "" };
const casa = { label: "Casa", dane: "76001", otherCity: "", otherDept: "", line1: "Calle 5 # 38-20", neighborhood: "San Fernando", notes: "Torre 2, apto 301" };

beforeEach(() => Object.assign(db, { customer: { id: "cust-A" }, recentEquipment: [], recentAddresses: [], inserted: [], allowed: true, count: 0 }));

describe("registrar un equipo desde la solicitud", () => {
  it("lo crea para el cliente de la SESIÓN: un customer_id enviado por el navegador se ignora", async () => {
    const r = await quickCreateEquipment({ ...laptop, customer_id: "cust-OTRO" } as never);
    expect(r).toMatchObject({ ok: true, reused: false, equipment: { id: "new-equipment", brand: "Lenovo" } });
    expect(db.inserted[0].row).toMatchObject({ customer_id: "cust-A", type: "laptop", brand: "Lenovo", model: "ThinkPad E14" });
    expect(db.inserted).toHaveLength(1);
  });
  it("un doble clic o reintento NO duplica: el equipo idéntico reciente se reutiliza (sin importar mayúsculas)", async () => {
    db.recentEquipment = [{ id: "eq-1", type: "laptop", brand: "LENOVO", model: "thinkpad  e14", serial: null }];
    const r = await quickCreateEquipment(laptop);
    expect(r).toMatchObject({ ok: true, reused: true, equipment: { id: "eq-1" } });
    expect(db.inserted).toHaveLength(0);
  });
  it("tipos distintos de portátil/PC (impresora, red, otro) se admiten; un tipo inventado o faltantes se rechazan con mensajes claros", async () => {
    expect((await quickCreateEquipment({ ...laptop, type: "printer", brand: "HP", model: "LaserJet" })).ok).toBe(true);
    const bad = await quickCreateEquipment({ ...laptop, type: "nave", brand: "", model: "" });
    expect(bad).toMatchObject({ ok: false, fieldErrors: expect.objectContaining({ brand: "Escribe la marca.", model: "Escribe el modelo." }) });
    expect(db.inserted).toHaveLength(1);
  });
  it("respeta el límite de intentos y exige ficha de cliente", async () => {
    db.allowed = false;
    expect(await quickCreateEquipment(laptop)).toMatchObject({ ok: false, error: "Demasiados intentos." });
    db.allowed = true;
    db.customer = null;
    expect(await quickCreateEquipment(laptop)).toMatchObject({ ok: false });
    expect(db.inserted).toHaveLength(0);
  });
});

describe("registrar una dirección desde la solicitud", () => {
  it("la crea para el cliente de la sesión, sin reemplazar las anteriores (la primera es la principal, las demás no)", async () => {
    const first = await quickCreateAddress(casa, ["store", "home"]);
    expect(first).toMatchObject({ ok: true, reused: false, address: { id: "new-addresses", zone: { homeFee: 10000, covered: { home: true } } } });
    expect(db.inserted[0].row).toMatchObject({ customer_id: "cust-A", label: "Casa", dane_code: "76001", notes: "Torre 2, apto 301", is_default: true });
    db.count = 1;
    await quickCreateAddress({ ...casa, label: "Oficina", line1: "Carrera 100 # 11-60" }, ["store", "home"]);
    expect(db.inserted[1].row).toMatchObject({ label: "Oficina", is_default: false });
  });
  it("un doble clic o reintento NO duplica la dirección", async () => {
    db.recentAddresses = [{ id: "ad-1", label: "Casa", line1: "calle 5  # 38-20", neighborhood: null, city_name: "Cali", dane_code: "76001" }];
    const r = await quickCreateAddress(casa, ["home"]);
    expect(r).toMatchObject({ ok: true, reused: true, address: { id: "ad-1" } });
    expect(db.inserted).toHaveLength(0);
  });
  it("una dirección en otra ciudad se puede registrar, pero su zona NO habilita domicilio (solo soporte remoto)", async () => {
    const r = await quickCreateAddress({ ...casa, dane: "other", otherCity: "Bogotá", otherDept: "Cundinamarca" }, ["home"]);
    expect(r).toMatchObject({ ok: true, address: { city_name: "Bogotá" } });
    expect(db.inserted[0].row).toMatchObject({ dane_code: "00000" });
  });
  it("valida los datos y la dirección vacía se rechaza", async () => {
    const r = await quickCreateAddress({ ...casa, line1: "" }, ["home"]);
    expect(r).toMatchObject({ ok: false, fieldErrors: expect.objectContaining({ line1: "Escribe tu dirección." }) });
    expect(db.inserted).toHaveLength(0);
  });
});
