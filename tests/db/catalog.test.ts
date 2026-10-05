import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let admin: string, tech: string, cliA: string, custA: string, cat: string, sub: string, svcFrom: string, svcFixed: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;

async function ticketInDiagnosis(service: string): Promise<string> {
  const [{ id }] = await q<{ id: string }>(
    `insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','Falla de prueba',$3) returning id`,
    [custA, service, tech],
  );
  await q(`insert into receptions (ticket_id, reason) values ($1,'Falla')`, [id]);
  for (let i = 0; i < 4; i++) await q(`insert into evidence (ticket_id, stage, cloudinary_public_id) values ($1,'reception',$2)`, [id, `e/${id}/${i}`]);
  await as(db, tech, () => q(`select public.transition_ticket($1,'diagnosing')`, [id]));
  return id;
}

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, "admin@technoultra.com");
  await makeAdmin(db, admin);
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, admin, tech);
  cliA = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
  custA = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliA]))[0].id;
  cat = (await q<{ id: string }>(`insert into service_categories (slug, name, kind) values ('cat-prueba','Categoría prueba','technical') returning id`))[0].id;
  sub = (await q<{ id: string }>(`insert into service_subcategories (category_id, slug, name) values ($1,'sub-prueba','Sub prueba') returning id`, [cat]))[0].id;
  svcFrom = (await q<{ id: string }>(
    `insert into services (slug, name, kind, category_id, subcategory_id, price_mode, base_price, price_type_label, allowed_modalities) values ('desde','Servicio desde','technical',$1,$2,'from',100000,'Desde','{store}') returning id`,
    [cat, sub],
  ))[0].id;
  svcFixed = (await q<{ id: string }>(`insert into services (slug, name, kind, category_id, price_mode, base_price, allowed_modalities) values ('fijo','Servicio fijo','technical',$1,'fixed',50000,'{store}') returning id`, [cat]))[0].id;
}, 180000);

describe("catálogo: permisos", () => {
  it("lectura pública de subcategorías activas; el cliente y el técnico no las modifican", async () => {
    expect((await as(db, cliA, () => q(`select id from service_subcategories`))).length).toBe(1);
    await expect(as(db, cliA, () => q(`insert into service_subcategories (category_id, slug, name) values ($1,'x-x','Mala')`, [cat]))).rejects.toThrow(denied);
    await expect(as(db, tech, () => q(`update service_subcategories set name = 'Hack' where id = $1`, [sub]))).resolves.toBeDefined();
    expect((await q<{ name: string }>(`select name from service_subcategories where id = $1`, [sub]))[0].name).toBe("Sub prueba");
  });
  it("trazabilidad de importación, fuentes y reglas: solo administración", async () => {
    await q(`insert into service_import_meta (service_id, import_key, raw) values ($1,'tarifario-2026:9999','{}')`, [svcFixed]);
    expect((await as(db, cliA, () => q(`select 1 from service_import_meta`))).length).toBe(0);
    expect((await as(db, tech, () => q(`select 1 from service_import_meta`))).length).toBe(0);
    expect((await as(db, admin, () => q(`select 1 from service_import_meta`))).length).toBe(1);
  });
  it("solo el administrador elimina; cliente y técnico no", async () => {
    await expect(as(db, cliA, () => q(`select public.delete_service($1)`, [svcFixed]))).rejects.toThrow(denied);
    await expect(as(db, tech, () => q(`select public.delete_service($1)`, [svcFixed]))).rejects.toThrow(denied);
  });
});

describe("catálogo: snapshots y precio 'Desde'", () => {
  it("la línea de cotización conserva el snapshot aunque el catálogo cambie después", async () => {
    const t = await ticketInDiagnosis(svcFixed);
    const [{ id: quote }] = await as(db, tech, () => q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [t, custA]));
    await as(db, tech, () => q(`insert into quote_items (quote_id, kind, service_id, description, qty, warranty_days) values ($1,'service',$2,'Servicio',1,0)`, [quote, svcFixed]));
    await q(`update services set base_price = 99999, name = 'Renombrado' where id = $1`, [svcFixed]);
    const [item] = await q<{ unit_price: string; snap: { base_price: number; name: string } }>(`select unit_price, service_snapshot snap from quote_items where quote_id = $1`, [quote]);
    expect(Number(item.unit_price)).toBe(50000);
    expect(item.snap.base_price).toBe(50000);
    expect(item.snap.name).toBe("Servicio fijo");
    const [tk] = await q<{ snap: { base_price: number } | null }>(`select service_snapshot snap from tickets where id = $1`, [t]);
    expect(tk.snap?.base_price).toBe(50000);
  });
  it("'Desde' acepta un valor igual o mayor al base, pero no menor sin permiso", async () => {
    const t = await ticketInDiagnosis(svcFrom);
    const [{ id: quote }] = await as(db, tech, () => q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [t, custA]));
    await as(db, tech, () => q(`insert into quote_items (quote_id, position, kind, service_id, description, qty, unit_price, warranty_days) values ($1,1,'service',$2,'Mayor',1,180000,0)`, [quote, svcFrom]));
    await expect(as(db, tech, () => q(`insert into quote_items (quote_id, position, kind, service_id, description, qty, unit_price, warranty_days) values ($1,2,'service',$2,'Menor',1,50000,0)`, [quote, svcFrom]))).rejects.toThrow(/price_override_forbidden|forbidden|42501/);
  });
  it("un precio distinto en servicio de precio fijo sigue prohibido", async () => {
    const t = await ticketInDiagnosis(svcFixed);
    const [{ id: quote }] = await as(db, tech, () => q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [t, custA]));
    await expect(as(db, tech, () => q(`insert into quote_items (quote_id, kind, service_id, description, qty, unit_price, warranty_days) values ($1,'service',$2,'X',1,1000,0)`, [quote, svcFixed]))).rejects.toThrow(/price_override_forbidden|forbidden|42501/);
  });
});

describe("catálogo: eliminación segura", () => {
  it("un servicio con historial se archiva; uno sin uso se elimina", async () => {
    const [{ r: used }] = await as(db, admin, () => q<{ r: string }>(`select public.delete_service($1) r`, [svcFixed]));
    expect(used).toBe("archived");
    const row = (await q<{ is_active: boolean; deleted: boolean }>(`select is_active, deleted_at is not null deleted from services where id = $1`, [svcFixed]))[0];
    expect(row).toEqual({ is_active: false, deleted: true });
    const [free] = await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities) values ('libre','Libre','technical',1000,'{store}') returning id`);
    const [{ r: gone }] = await as(db, admin, () => q<{ r: string }>(`select public.delete_service($1) r`, [free.id]));
    expect(gone).toBe("deleted");
    expect((await q(`select 1 from services where id = $1`, [free.id])).length).toBe(0);
  });
  it("no se elimina una categoría ni subcategoría con servicios", async () => {
    await expect(as(db, admin, () => q(`select public.delete_service_category($1)`, [cat]))).rejects.toThrow(/category_in_use/);
    await expect(as(db, admin, () => q(`select public.delete_service_subcategory($1)`, [sub]))).rejects.toThrow(/subcategory_in_use/);
  });
});
