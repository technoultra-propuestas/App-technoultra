import { beforeAll, describe, expect, it } from "vitest";
import { createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let admin: string, tech: string, cli: string, cliOther: string, cust: string, custOther: string, svc: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const count = async (sql: string, params: unknown[] = []) => Number((await q<{ n: string }>(sql, params))[0].n);

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, "admin@technoultra.com");
  await makeAdmin(db, admin);
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, admin, tech);
  cli = await createUser(db, "borrar@gmail.com", { full_name: "Cliente a borrar" });
  cliOther = await createUser(db, "queda@gmail.com", { full_name: "Cliente que queda" });
  cust = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cli]))[0].id;
  custOther = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliOther]))[0].id;
  svc = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities) values ('mant','Mantenimiento','technical',70000,'{store}') returning id`))[0].id;
}, 180000);

const purge = (actor: string, target: string, email: string) => q<{ r: Record<string, unknown> }>(`select public.admin_purge_user($1,$2,$3) r`, [actor, target, email]);

describe("eliminación definitiva de cuentas (solo superadmin)", () => {
  it("rechaza a quien no es superadmin, a uno mismo, a un superadmin y un correo que no coincide", async () => {
    await expect(purge(tech, cli, "borrar@gmail.com")).rejects.toThrow(/forbidden/);
    await expect(purge(cli, cli, "borrar@gmail.com")).rejects.toThrow(/forbidden/);
    await expect(purge(admin, admin, "admin@technoultra.com")).rejects.toThrow(/cannot_purge_self/);
    const other = await createUser(db, "otro-admin@technoultra.com");
    await makeAdmin(db, other).catch(() => undefined); // un único propietario: si no deja crear otro superadmin, la regla ya protege
    await expect(purge(admin, cli, "otro@correo.com")).rejects.toThrow(/email_mismatch/);
    expect(await count(`select count(*) n from auth.users where id = $1`, [cli])).toBe(1);
  });

  it("no se puede llamar desde el navegador (solo service_role)", async () => {
    await q(`set role authenticated`);
    await expect(purge(admin, cli, "borrar@gmail.com")).rejects.toThrow(/permission denied/i);
    await q(`reset role`);
  });

  it("borra la cuenta con TODO lo suyo (incluidas tablas de solo inserción), conserva lo ajeno y deja copia y auditoría", async () => {
    await q(`insert into addresses (customer_id, line1, city_name, department, dane_code) values ($1,'Cra 1','Cali','Valle del Cauca','76001')`, [cust]);
    await q(`insert into equipment (customer_id, type, brand, model) values ($1,'laptop','Lenovo','E14')`, [cust]);
    const [{ id: ticket }] = await q<{ id: string }>(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','Muy lento al encender',$3) returning id`, [cust, svc, tech]);
    await q(`insert into evidence (ticket_id, stage, cloudinary_public_id) values ($1,'reception','e/borrar/1')`, [ticket]);
    const [{ id: ticketKeep }] = await q<{ id: string }>(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','Pantalla con rayas',$3) returning id`, [custOther, svc, tech]);
    const [{ id: legalDoc }] = await q<{ id: string }>(`insert into legal_documents (slug, version, title, content, status) values ('terms',1,'Términos','texto','published') returning id`);
    await q(`insert into legal_acceptances (profile_id, legal_document_id) values ($1,$2), ($3,$2)`, [cli, legalDoc, cliOther]);

    const [{ r }] = await purge(admin, cli, "BORRAR@gmail.com");
    expect((r.counts as Record<string, number>)["public.tickets"]).toBe(1);
    expect(r.assets).toMatchObject({ cloudinary: ["e/borrar/1"] });

    expect(await count(`select count(*) n from auth.users where id = $1`, [cli])).toBe(0);
    expect(await count(`select count(*) n from profiles where id = $1`, [cli])).toBe(0);
    expect(await count(`select count(*) n from customers where id = $1`, [cust])).toBe(0);
    expect(await count(`select count(*) n from tickets where id = $1`, [ticket])).toBe(0);
    expect(await count(`select count(*) n from evidence where ticket_id = $1`, [ticket])).toBe(0);
    expect(await count(`select count(*) n from legal_acceptances where profile_id = $1`, [cli])).toBe(0);

    // lo ajeno queda intacto
    expect(await count(`select count(*) n from tickets where id = $1`, [ticketKeep])).toBe(1);
    expect(await count(`select count(*) n from profiles where id = $1`, [cliOther])).toBe(1);
    expect(await count(`select count(*) n from profiles where id = $1`, [tech])).toBe(1);
    expect(await count(`select count(*) n from legal_acceptances where profile_id = $1`, [cliOther])).toBe(1);

    // la guarda de solo inserción sigue activa después
    await expect(q(`delete from legal_acceptances where profile_id = $1`, [cliOther])).rejects.toThrow(/immutable|solo INSERT/i);
    // copia y auditoría
    const arch = await q<{ target_email: string; snapshot: Record<string, unknown[]> }>(`select target_email, snapshot from purged_users_archive where target_id = $1`, [cli]);
    expect(arch[0].target_email).toBe("borrar@gmail.com");
    expect(Object.keys(arch[0].snapshot)).toEqual(expect.arrayContaining(["public.tickets", "public.customers", "auth.users"]));
    expect(JSON.stringify(arch[0].snapshot)).not.toContain("encrypted_password");
    expect(await count(`select count(*) n from audit_logs where action = 'user.purged' and entity_id = $1`, [cli])).toBe(1);
  });

  it("al borrar a un técnico, sus tickets asignados quedan sin asignar (no se borran)", async () => {
    const [{ id: t2 }] = await q<{ id: string }>(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','No carga el cargador',$3) returning id`, [custOther, svc, tech]);
    await purge(admin, tech, "tec@technoultra.com");
    expect(await count(`select count(*) n from auth.users where id = $1`, [tech])).toBe(0);
    expect((await q<{ a: string | null }>(`select assigned_to a from tickets where id = $1`, [t2]))[0].a).toBeNull();
  });
});
