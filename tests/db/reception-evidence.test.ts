import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let owner: string, tech1: string, tech2: string, cliA: string, cliB: string, custA: string, svc: string, t1: string, t2: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@technoultra.com");
  await makeAdmin(db, owner);
  tech1 = await createUser(db, "t1@technoultra.com");
  await makeTechnician(db, owner, tech1);
  tech2 = await createUser(db, "t2@technoultra.com");
  await makeTechnician(db, owner, tech2);
  cliA = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
  cliB = await createUser(db, "b@gmail.com", { full_name: "Cliente B" });
  custA = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliA]))[0].id;
  svc = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities) values ('rep','Reparación','technical',50000,'{store}') returning id`))[0].id;
  const mk = (tech: string) => q<{ id: string }>(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','Falla',$3) returning id`, [custA, svc, tech]).then((r) => r[0].id);
  t1 = await mk(tech1);
  t2 = await mk(tech2);
  for (const [t, who] of [[t1, "t1"], [t2, "t2"]] as const) {
    await q(`insert into evidence (ticket_id, stage, slot, cloudinary_public_id) values ($1,'reception','front',$2), ($1,'reception','back',$3), ($1,'payment','voucher',$4), ($1,'diagnosis','other',$5)`, [t, `${who}/f`, `${who}/b`, `${who}/v`, `${who}/d`]);
  }
}, 180000);

const ids = (rows: { cloudinary_public_id: string }[]) => rows.map((r) => r.cloudinary_public_id).sort();

describe("evidencia de recepción: aislamiento por ticket y rol", () => {
  it("el técnico asignado ve la evidencia de SU ticket y nada del ticket de otro técnico", async () => {
    expect(ids(await as(db, tech1, () => q<{ cloudinary_public_id: string }>(`select cloudinary_public_id from evidence`)))).toEqual(["t1/b", "t1/d", "t1/f", "t1/v"]);
    expect(await as(db, tech2, () => q(`select 1 from evidence where ticket_id = $1`, [t1]))).toHaveLength(0);
  });
  it("el cliente ve SOLO las fotos de recepción de su propio ticket (no comprobantes ni evidencia interna) y nada de otros clientes", async () => {
    expect(ids(await as(db, cliA, () => q<{ cloudinary_public_id: string }>(`select cloudinary_public_id from evidence`)))).toEqual(["t1/b", "t1/f", "t2/b", "t2/f"]);
    expect(await as(db, cliB, () => q(`select 1 from evidence`))).toHaveLength(0);
  });
  it("nadie desde la API crea, edita ni borra evidencia (solo el servidor registra tras verificar en Cloudinary)", async () => {
    for (const who of [cliA, tech1]) {
      await expect(as(db, who, () => q(`insert into evidence (ticket_id, stage, slot, cloudinary_public_id) values ($1,'reception','left','x/new')`, [t1]))).rejects.toThrow(denied);
      await expect(as(db, who, () => q(`update evidence set deleted_at = now() where ticket_id = $1`, [t1]))).rejects.toThrow(denied);
    }
  });
  it("una foto retirada (borrado lógico) deja de verse para todos y no cuenta", async () => {
    await q(`update evidence set deleted_at = now() where cloudinary_public_id = 't1/b'`);
    expect(ids(await as(db, tech1, () => q<{ cloudinary_public_id: string }>(`select cloudinary_public_id from evidence where stage = 'reception'`)))).toEqual(["t1/f"]);
    expect(ids(await as(db, cliA, () => q<{ cloudinary_public_id: string }>(`select cloudinary_public_id from evidence where ticket_id = $1`, [t1])))).toEqual(["t1/f"]);
  });
});

describe("acta de recepción: permisos y datos conservados", () => {
  it("solo el técnico asignado (o el SUPERADMIN) registra la recepción de un ticket; el cliente nunca", async () => {
    await expect(as(db, tech2, () => q(`insert into receptions (ticket_id, reason) values ($1,'Falla')`, [t1]))).rejects.toThrow(denied);
    await expect(as(db, cliA, () => q(`insert into receptions (ticket_id, reason) values ($1,'Falla')`, [t1]))).rejects.toThrow(denied);
    await as(db, tech1, () => q(`insert into receptions (ticket_id, reason, accessories, visible_damage, physical_condition, observations) values ($1,'Falla','{Cargador}','{Rayones,"Otros daños"}','Estado histórico','Detalles nuevos')`, [t1]));
  });
  it("daños, accesorios, motivo, estado físico histórico y detalles se conservan; queda quién y cuándo", async () => {
    const [r] = await as(db, tech1, () => q<{ reason: string; accessories: string[]; visible_damage: string[]; physical_condition: string; observations: string; received_by: string; created_at: string }>(`select * from receptions where ticket_id = $1`, [t1]));
    expect(r).toMatchObject({ reason: "Falla", accessories: ["Cargador"], visible_damage: ["Rayones", "Otros daños"], physical_condition: "Estado histórico", observations: "Detalles nuevos", received_by: tech1 });
    expect(r.created_at).toBeTruthy();
    // el cliente dueño puede ver el acta de su equipo; otro cliente no
    expect(await as(db, cliA, () => q(`select 1 from receptions where ticket_id = $1`, [t1]))).toHaveLength(1);
    expect(await as(db, cliB, () => q(`select 1 from receptions`))).toHaveLength(0);
  });
});
