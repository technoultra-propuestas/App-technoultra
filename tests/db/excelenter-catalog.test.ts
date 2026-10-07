import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let owner: string, tech: string, cli: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501|source_columns_locked/i;
type Item = { source_product_id: string; source_ref?: string; name: string; brand?: string; category?: string; subcategory?: string; price: unknown; stock: unknown; description?: string; image_url?: string };
const item = (id: string, over: Partial<Item> = {}): Item => ({ source_product_id: id, source_ref: id, name: `Producto ${id}`, brand: "ACME", category: "Periféricos", subcategory: "Mouse", price: 100000, stock: 1, description: "Descripción", image_url: `https://res.cloudinary.com/x/${id}.webp`, ...over });
const sync = async (items: unknown[], type = "manual", source = "EXCELENTER") => (await q<{ r: Record<string, number | string> }>(`select public.sync_catalog($3, $1::jsonb, $2) as r`, [JSON.stringify(items), type, source]))[0].r;
const prod = async (id: string) =>
  (await q<{ id: string; price: string; source_available: boolean; is_active: boolean; slug: string; category_id: string | null; subcategory_id: string | null; image_url: string | null }>(
    `select id, price, source_available, is_active, slug, category_id, subcategory_id, image_url from products where source = 'EXCELENTER' and source_product_id = $1`, [id]))[0];
// Mantiene el resto del catálogo disponible para que la guarda de caída brusca no rechace una prueba con pocos productos.
const allPlus = async (...extra: Item[]) => {
  const rows = await q<{ source_product_id: string }>(`select source_product_id from products where source = 'EXCELENTER' and source_available`);
  const known = new Set(extra.map((e) => e.source_product_id));
  return [...rows.filter((r) => !known.has(r.source_product_id)).map((r) => item(r.source_product_id)), ...extra];
};
const cost = async (id: string) => (await q<{ source_price: string; source_stock: number; deactivation_reason: string | null }>(`select s.source_price, s.source_stock, s.deactivation_reason from product_source s join products p on p.id = s.product_id where p.source_product_id = $1`, [id]))[0];

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@technoultra.com");
  await makeAdmin(db, owner);
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, owner, tech);
  cli = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
}, 180000);

describe("importación: identidad, categorías y precio", () => {
  it("crea productos con categoría y subcategoría exactas, precio +20 % y sin duplicar al repetir", async () => {
    const items = [
      item("A1", { price: 100000 }),
      item("A2", { price: 110000, category: "PERIFERICOS", subcategory: "Teclados" }),
      item("A3", { price: 90000, category: "Periféricos ", subcategory: "mouse" }),
      item("B1", { category: "Componentes", subcategory: "Procesadores" }),
      item("B2", { category: "Redes", subcategory: undefined }),
    ];
    const r = await sync(items, "import");
    expect(r).toMatchObject({ status: "success", created: 5, errors: 0 });
    expect(Number((await prod("A1")).price)).toBe(120000);
    expect(Number((await prod("A2")).price)).toBe(132000);
    expect(Number((await prod("A3")).price)).toBe(108000);
    expect((await q(`select 1 from product_categories where private.norm_key(name) = 'perifericos'`)).length).toBe(1); // sin duplicados por mayúsculas/espacios/acentos
    expect((await q(`select 1 from product_subcategories s join product_categories c on c.id = s.category_id where private.norm_key(s.name) = 'mouse' and private.norm_key(c.name) = 'perifericos'`)).length).toBe(1);
    // Relación padre → hijo respetada: «Procesadores» cuelga de «Componentes» y no al revés.
    expect((await q(`select 1 from product_subcategories s join product_categories c on c.id = s.category_id where s.name = 'Procesadores' and c.name = 'Componentes'`)).length).toBe(1);
    expect((await q(`select 1 from product_categories where name = 'Procesadores'`)).length).toBe(0);
    expect((await prod("B2")).subcategory_id).toBeNull();
    const again = await sync(items);
    expect(again).toMatchObject({ status: "success", created: 0, updated: 0 });
    expect((await q(`select 1 from products where source = 'EXCELENTER'`)).length).toBe(5);
  });
  it("redondea al peso sin errores de coma flotante y guarda el costo aparte (solo administración)", async () => {
    await sync([item("R1", { price: 333333 })]);
    expect(Number((await prod("R1")).price)).toBe(400000); // 333 333 × 1,2 = 399 999,6 → 400 000
    expect(Number((await cost("R1")).source_price)).toBe(333333);
  });
  it("el slug es estable aunque cambie el nombre y no se repite entre productos del mismo nombre", async () => {
    await sync([item("S1", { name: "Funda para portátil" }), item("S2", { name: "Funda para portátil" })]);
    const a = await prod("S1"), b = await prod("S2");
    expect(a.slug).not.toBe(b.slug);
    await sync([item("S1", { name: "Funda renombrada" }), item("S2", { name: "Funda para portátil" })]);
    expect((await prod("S1")).slug).toBe(a.slug);
  });
});

describe("stock como señal de disponibilidad", () => {
  it("stock 0 oculta (sin borrar); al volver stock > 0 reaparece; la fuente sin el producto lo oculta y al volver reaparece", async () => {
    await sync([item("T1"), item("T2")]);
    expect((await prod("T1")).source_available).toBe(true);
    await sync([item("T1", { stock: 0 }), item("T2")]);
    expect((await prod("T1")).source_available).toBe(false);
    expect((await cost("T1")).deactivation_reason).toBe("out_of_stock");
    expect((await q(`select 1 from products where source_product_id = 'T1'`)).length).toBe(1); // conservado
    await sync([item("T1", { stock: 3 }), item("T2")]);
    expect((await prod("T1")).source_available).toBe(true);
    // T2 desaparece de la fuente.
    const r = await sync([item("T1")]);
    expect(Number(r.deactivated)).toBeGreaterThanOrEqual(1);
    expect((await prod("T2")).source_available).toBe(false);
    expect((await cost("T2")).deactivation_reason).toBe("missing_from_source");
    expect(Number((await cost("T2")).source_price)).toBe(100000); // precio anterior conservado
    await sync([item("T1"), item("T2")]);
    expect((await prod("T2")).source_available).toBe(true);
  });
  it("cantidades mayores a 1 se guardan pero la señal pública es solo «disponible»", async () => {
    await sync([item("Q1", { stock: 7 })]);
    expect((await prod("Q1")).source_available).toBe(true);
    expect((await cost("Q1")).source_stock).toBe(7);
  });
});

describe("la decisión manual del SUPERADMIN prevalece", () => {
  it("un producto oculto a mano no reaparece aunque la fuente lo vuelva a ofrecer", async () => {
    await sync([item("M1")]);
    const id = (await prod("M1")).id;
    await as(db, owner, () => q(`update products set is_active = false where id = $1`, [id]), { aal: "aal2" });
    await sync([item("M1", { stock: 0 })]);
    await sync([item("M1", { stock: 5, price: 120000 })]);
    const p = await prod("M1");
    expect(p.source_available).toBe(true);
    expect(p.is_active).toBe(false);
    const visible = await as(db, null, () => q(`select 1 from products where id = $1`, [id]));
    expect(visible.length).toBe(0);
  });
});

describe("cambios y alertas", () => {
  it("detecta precio, categoría, subcategoría e imagen; guarda historial; alerta si el salto supera el 20 %", async () => {
    await sync([item("C1", { price: 100000 })]);
    const r = await sync([item("C1", { price: 150000, subcategory: "Teclados", image_url: "https://res.cloudinary.com/x/nueva.webp" })]);
    expect(r).toMatchObject({ prices_changed: 1, warnings: 1 });
    expect(Number((await prod("C1")).price)).toBe(180000);
    expect((await prod("C1")).image_url).toContain("nueva");
    const hist = await q(`select source_price from product_price_history h join products p on p.id = h.product_id where p.source_product_id = 'C1' order by h.id`);
    expect(hist.map((h) => Number((h as { source_price: string }).source_price))).toEqual([100000, 150000]);
    const run = (await q<{ warnings: { type: string }[] }>(`select warnings from catalog_sync_runs order by started_at desc limit 1`))[0];
    expect(run.warnings.some((w) => w.type === "price_jump")).toBe(true);
  });
  it("una imagen vacía no borra la última imagen válida", async () => {
    await sync([item("I1")]);
    await sync([item("I1", { image_url: "" })]);
    expect((await prod("I1")).image_url).toContain("I1");
  });
});

describe("datos inválidos y fallos de la fuente", () => {
  it("precio nulo/0/negativo o sin id no se publica ni destruye el último dato válido, y no oculta al producto", async () => {
    await sync([item("V1", { price: 100000 }), item("V2")]);
    const r = await sync([item("V1", { price: 0 }), item("V2", { price: null }), { name: "Sin id", price: 5000, stock: 1 }, item("V3")]);
    expect(r).toMatchObject({ status: "partial", created: 1 });
    expect(Number((await cost("V1")).source_price)).toBe(100000);
    expect((await prod("V1")).source_available).toBe(true);
    expect((await prod("V2")).source_available).toBe(true);
    expect(await prod("V3")).toBeTruthy();
  });
  it("una fuente vacía no oculta nada: se registra el error y se conserva el último estado", async () => {
    await sync([item("E1")]);
    const before = (await q(`select 1 from products where source = 'EXCELENTER' and source_available`)).length;
    const r = await sync([]);
    expect(r).toMatchObject({ status: "error", reason: "empty_source" });
    expect((await q(`select 1 from products where source = 'EXCELENTER' and source_available`)).length).toBe(before);
  });
  it("una caída brusca (menos de la mitad del catálogo) se rechaza sin tocar los productos", async () => {
    // Fuente aparte para no mezclar con el resto de pruebas (la guarda se evalúa por fuente).
    const many = Array.from({ length: 30 }, (_, i) => item(`D${i}`));
    await sync(many, "manual", "FUENTE_PRUEBA");
    const before = (await q(`select 1 from products where source = 'FUENTE_PRUEBA' and source_available`)).length;
    const r = await sync(many.slice(0, 5), "manual", "FUENTE_PRUEBA");
    expect(r).toMatchObject({ status: "error", reason: "suspicious_drop" });
    expect((await q(`select 1 from products where source = 'FUENTE_PRUEBA' and source_available`)).length).toBe(before);
  });
  it("record_catalog_sync_failure deja constancia sin modificar el catálogo", async () => {
    const before = (await q(`select count(*)::int as n from products`))[0] as { n: number };
    await q(`select public.record_catalog_sync_failure('EXCELENTER', 'automatic', 'timeout')`);
    const run = (await q<{ status: string; error_count: number }>(`select status, error_count from catalog_sync_runs order by started_at desc limit 1`))[0];
    expect(run).toMatchObject({ status: "error", error_count: 1 });
    expect((await q(`select count(*)::int as n from products`))[0]).toEqual(before);
  });
});

describe("seguridad (RLS, columnas bloqueadas y separación del cobro)", () => {
  it("el público ve productos disponibles pero NO el costo del proveedor ni las tablas de sincronización", async () => {
    await sync(await allPlus(item("P1")));
    const rows = await as(db, null, () => q(`select id, price from products where source_product_id = 'P1'`));
    expect(rows.length).toBe(1);
    for (const t of ["product_source", "product_price_history", "catalog_sync_runs", "product_inquiries"]) {
      await expect(as(db, null, () => q(`select 1 from ${t}`))).rejects.toThrow(denied);
      expect((await as(db, cli, () => q(`select 1 from ${t}`))).length).toBe(0);
      expect((await as(db, tech, () => q(`select 1 from ${t}`))).length).toBe(0);
    }
    expect((await as(db, owner, () => q(`select 1 from product_source`), { aal: "aal2" })).length).toBeGreaterThan(0);
  });
  it("cliente y técnico no pueden crear ni editar productos; el SUPERADMIN no puede cambiar precio, nombre, categoría ni la fuente", async () => {
    const id = (await prod("P1")).id;
    for (const who of [cli, tech]) {
      await expect(as(db, who, () => q(`update products set price = 1 where id = $1`, [id]), { aal: "aal2" })).resolves.toBeDefined();
      expect(Number((await prod("P1")).price)).toBe(120000);
    }
    await expect(as(db, owner, () => q(`update products set price = 1 where id = $1`, [id]), { aal: "aal2" })).rejects.toThrow(denied);
    await expect(as(db, owner, () => q(`update products set name = 'Otro' where id = $1`, [id]), { aal: "aal2" })).rejects.toThrow(denied);
    await expect(as(db, owner, () => q(`update products set source_available = false where id = $1`, [id]), { aal: "aal2" })).rejects.toThrow(denied);
    await expect(as(db, owner, () => q(`update products set source = null, source_product_id = null where id = $1`, [id]), { aal: "aal2" })).rejects.toThrow(denied);
    await expect(as(db, owner, () => q(`insert into products (sku, slug, name, price, source, source_product_id) values ('ZZ-1', 'zz-1', 'Falso', 5, 'EXCELENTER', 'ZZ-1')`), { aal: "aal2" })).rejects.toThrow(denied);
    // Sí puede ocultar/mostrar y editar garantía.
    await as(db, owner, () => q(`update products set is_active = true, warranty_days = 30 where id = $1`, [id]), { aal: "aal2" });
    expect((await prod("P1")).is_active).toBe(true);
  });
  it("nadie salvo el servidor ejecuta la sincronización", async () => {
    for (const who of [null, cli, tech, owner]) {
      await expect(as(db, who, () => q(`select public.sync_catalog('EXCELENTER', '[]'::jsonb, 'manual')`), { aal: "aal2" })).rejects.toThrow(/permission denied|42501/i);
    }
    await expect(as(db, owner, () => q(`select public.record_catalog_sync_failure('EXCELENTER', 'manual', 'x')`), { aal: "aal2" })).rejects.toThrow(/permission denied|42501/i);
  });
  it("un producto de proveedor jamás entra a un pedido (no hay cobro por Mercado Pago)", async () => {
    const id = (await prod("P1")).id;
    const custId = (await q<{ id: string }>(`select id from customers limit 1`))[0]?.id ?? (await q<{ id: string }>(`insert into customers (full_name, email) values ('C', 'c@x.co') returning id`))[0].id;
    const order = (await q<{ id: string }>(`insert into orders (customer_id, delivery_method) values ($1, 'pickup_store') returning id`, [custId]))[0].id;
    await expect(q(`insert into order_items (order_id, product_id, description, qty, unit_price) values ($1, $2, 'x', 1, 1000)`, [order, id])).rejects.toThrow(/product_unavailable/);
  });
  it("la actualización de la fuente nunca modifica la visibilidad manual ni el costo es visible al cliente en la API de productos", async () => {
    const cols = await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'products'`);
    expect(cols.map((c) => c.column_name)).not.toContain("source_price");
    expect(cols.map((c) => c.column_name)).not.toContain("source_stock");
  });
});
