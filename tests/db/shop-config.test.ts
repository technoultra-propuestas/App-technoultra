import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let owner: string, tech: string, cli: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501|violates/i;
const banner = async (over: Record<string, string> = {}) => {
  const v = { title: "Promo", active: "true", starts: "null", ends: "null", ...over };
  return (await q<{ id: string }>(`insert into shop_banners (title, is_active, starts_at, ends_at) values ($1, ${v.active}, ${v.starts}, ${v.ends}) returning id`, [v.title]))[0].id;
};

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@technoultra.com");
  await makeAdmin(db, owner);
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, owner, tech);
  cli = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
}, 180000);

describe("ajustes del Shop", () => {
  it("existe una fila con los valores por defecto y el público la puede leer", async () => {
    const r = await as(db, null, () => q<{ title: string; shipping_urban_fee: number; shipping_outside_fee: number }>(`select title, shipping_urban_fee, shipping_outside_fee from shop_settings`));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ title: "SHOP", shipping_urban_fee: 10000, shipping_outside_fee: 20000 });
  });
  it("solo el SUPERADMIN (con MFA) cambia los ajustes; cliente, técnico y anónimo no", async () => {
    await as(db, owner, () => q(`update shop_settings set title = 'TECH SHOP', shipping_urban_fee = 12000`), { aal: "aal2" });
    expect((await q<{ title: string }>(`select title from shop_settings`))[0].title).toBe("TECH SHOP");
    for (const who of [cli, tech, null]) {
      const res = await as(db, who, () => q(`update shop_settings set title = 'HACK'`), { aal: "aal2" }).catch((e) => e);
      expect(res instanceof Error ? denied.test(res.message) : (res as unknown[]).length === 0).toBe(true);
    }
    expect((await q<{ title: string }>(`select title from shop_settings`))[0].title).toBe("TECH SHOP");
  });
  it("rechaza tarifas o textos no válidos", async () => {
    await expect(as(db, owner, () => q(`update shop_settings set shipping_urban_fee = -1`), { aal: "aal2" })).rejects.toThrow(denied);
    await expect(as(db, owner, () => q(`update shop_settings set title = ''`), { aal: "aal2" })).rejects.toThrow(denied);
    await expect(as(db, owner, () => q(`update shop_settings set whatsapp_closing = 'x'`), { aal: "aal2" })).rejects.toThrow(denied);
  });
});

describe("banners promocionales", () => {
  it("sin banner activo y vigente el público no ve ninguno", async () => {
    await q(`delete from shop_banners`);
    await banner({ title: "Apagado", active: "false" });
    await banner({ title: "Vencido", ends: "now() - interval '1 day'" });
    await banner({ title: "Futuro", starts: "now() + interval '1 day'" });
    expect(await as(db, null, () => q(`select 1 from shop_banners`))).toHaveLength(0);
  });
  it("muestra los activos dentro de su ventana y la administración ve todos", async () => {
    await banner({ title: "Vigente", starts: "now() - interval '1 day'", ends: "now() + interval '1 day'" });
    const pub = await as(db, null, () => q<{ title: string }>(`select title from shop_banners`));
    expect(pub.map((b) => b.title)).toEqual(["Vigente"]);
    const asClient = await as(db, cli, () => q<{ title: string }>(`select title from shop_banners`));
    expect(asClient.map((b) => b.title)).toEqual(["Vigente"]);
    const all = await as(db, owner, () => q(`select 1 from shop_banners`), { aal: "aal2" });
    expect(all.length).toBe(4);
  });
  it("solo el SUPERADMIN crea, edita y borra banners", async () => {
    for (const who of [cli, tech]) {
      await expect(as(db, who, () => q(`insert into shop_banners (title) values ('Hack')`), { aal: "aal2" })).rejects.toThrow(denied);
    }
    await expect(as(db, null, () => q(`insert into shop_banners (title) values ('Hack')`))).rejects.toThrow(denied);
    const id = (await as(db, owner, () => q<{ id: string }>(`insert into shop_banners (title, subtitle, is_active, priority) values ('Nuevo', 'Sub', true, 5) returning id`), { aal: "aal2" }))[0].id;
    await as(db, owner, () => q(`update shop_banners set title = 'Editado' where id = $1`, [id]), { aal: "aal2" });
    expect((await q<{ title: string }>(`select title from shop_banners where id = $1`, [id]))[0].title).toBe("Editado");
    await as(db, owner, () => q(`delete from shop_banners where id = $1`, [id]), { aal: "aal2" });
    expect(await q(`select 1 from shop_banners where id = $1`, [id])).toHaveLength(0);
  });
  it("valida enlaces, imágenes, estilo y fechas", async () => {
    const bad = [
      `insert into shop_banners (title, cta_label, cta_href) values ('X', 'Ir', 'javascript:alert(1)')`,
      `insert into shop_banners (title, cta_label, cta_href) values ('X', 'Ir', '//evil.com/x')`,
      `insert into shop_banners (title, image_url) values ('X', 'http://inseguro/img.png')`,
      `insert into shop_banners (title, tone) values ('X', 'neon')`,
      `insert into shop_banners (title, starts_at, ends_at) values ('X', now(), now() - interval '1 hour')`,
      `insert into shop_banners (title) values ('')`,
    ];
    for (const sql of bad) await expect(as(db, owner, () => q(sql), { aal: "aal2" })).rejects.toThrow(denied);
    await as(db, owner, () => q(`insert into shop_banners (title, cta_label, cta_href, image_url) values ('Ok', 'Ver', '/tienda/categoria/componentes', 'https://res.cloudinary.com/x/y.webp')`), { aal: "aal2" });
  });
});

describe("destacados y orden", () => {
  it("el SUPERADMIN puede destacar un producto de proveedor y ordenar categorías sin tocar lo bloqueado", async () => {
    await q(`select public.sync_catalog('EXCELENTER', $1::jsonb, 'import')`, [JSON.stringify([{ source_product_id: "S-1", source_ref: "S-1", name: "Producto S1", brand: "ACME", category: "Periféricos", subcategory: "Mouse", price: 100000, stock: 1 }])]);
    const id = (await q<{ id: string }>(`select id from products where source_product_id = 'S-1'`))[0].id;
    await as(db, owner, () => q(`update products set is_featured = true, featured_rank = 3 where id = $1`, [id]), { aal: "aal2" });
    expect((await q<{ is_featured: boolean; featured_rank: number }>(`select is_featured, featured_rank from products where id = $1`, [id]))[0]).toEqual({ is_featured: true, featured_rank: 3 });
    await expect(as(db, owner, () => q(`update products set price = 1 where id = $1`, [id]), { aal: "aal2" })).rejects.toThrow(/source_columns_locked|42501|permission/i);
    await as(db, owner, () => q(`update product_categories set is_featured = true, sort_order = 1 where name = 'Periféricos'`), { aal: "aal2" });
    expect((await q<{ is_featured: boolean }>(`select is_featured from product_categories where name = 'Periféricos'`))[0].is_featured).toBe(true);
    for (const who of [cli, tech]) {
      const res = await as(db, who, () => q(`update products set is_featured = true where id = $1`, [id]), { aal: "aal2" }).catch((e) => e);
      expect(res instanceof Error ? true : (res as unknown[]).length === 0).toBe(true);
    }
  });
});
