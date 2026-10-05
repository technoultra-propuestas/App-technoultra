import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let admin: string, tech: string, cliA: string, cliB: string, custA: string, custB: string, svc: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, "admin@technoultra.com");
  await makeAdmin(db, admin);
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, admin, tech);
  cliA = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
  cliB = await createUser(db, "b@gmail.com", { full_name: "Cliente B" });
  custA = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliA]))[0].id;
  custB = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliB]))[0].id;
  svc = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities) values ('serv-prueba','Servicio prueba','technical',1000,'{store}') returning id`))[0].id;
  await q(`update customers set phone = '3001234567', document_type = 'CC', document_number = '123456789' where id = $1`, [custA]);
  await q(`insert into addresses (customer_id, line1, city_name, department, dane_code, notes) values ($1,'Calle 1 # 2-3','Cali','Valle del Cauca','76001','portería')`, [custA]);
  await q(`insert into equipment (customer_id, type, brand, model, serial) values ($1,'laptop','HP','Pavilion','SN123')`, [custA]);
}, 180000);

describe("anonimización de datos personales (Ley 1581)", () => {
  it("solo administración puede anonimizar", async () => {
    await expect(as(db, cliA, () => q(`select public.anonymize_customer($1)`, [custA]))).rejects.toThrow(denied);
    await expect(as(db, cliB, () => q(`select public.anonymize_customer($1)`, [custA]))).rejects.toThrow(denied);
    await expect(as(db, tech, () => q(`select public.anonymize_customer($1)`, [custA]))).rejects.toThrow(denied);
  });
  it("se bloquea si el cliente tiene trabajo abierto", async () => {
    const [{ id }] = await q<{ id: string }>(`insert into tickets (customer_id, service_id, modality, problem) values ($1,$2,'store','Falla de prueba') returning id`, [custA, svc]);
    await expect(as(db, admin, () => q(`select public.anonymize_customer($1)`, [custA]))).rejects.toThrow(/customer_has_open_work/);
    await q(`update tickets set status = 'cancelled', cancelled_reason = 'prueba' where id = $1`, [id]);
  });
  it("borra los datos personales y conserva el historial sin datos de contacto", async () => {
    await as(db, admin, () => q(`select public.anonymize_customer($1)`, [custA]));
    const [c] = await q<Record<string, unknown>>(`select full_name, phone, email, document_number, deleted_at is not null gone from customers where id = $1`, [custA]);
    expect(c).toMatchObject({ full_name: "Cliente anonimizado", phone: null, email: null, document_number: null, gone: true });
    const [a] = await q<Record<string, unknown>>(`select line1, notes from addresses where customer_id = $1`, [custA]);
    expect(a).toMatchObject({ line1: "Dirección eliminada", notes: null });
    expect((await q<{ serial: string | null }>(`select serial from equipment where customer_id = $1`, [custA]))[0].serial).toBeNull();
    const [p] = await q<{ email: string; is_active: boolean }>(`select email, is_active from profiles where id = $1`, [cliA]);
    expect(p.email).toMatch(/@anonimizado\.invalid$/);
    expect(p.is_active).toBe(false);
    expect((await q(`select 1 from tickets where customer_id = $1`, [custA])).length).toBe(1); // el historial se conserva
    expect((await q(`select 1 from audit_logs where action = 'customer.anonymized'`)).length).toBe(1);
  });
  it("es idempotente y no toca a otros clientes", async () => {
    await as(db, admin, () => q(`select public.anonymize_customer($1)`, [custA]));
    expect((await q<{ full_name: string }>(`select full_name from customers where id = $1`, [custB]))[0].full_name).toBe("Cliente B");
  });
});
