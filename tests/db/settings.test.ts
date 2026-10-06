import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let owner: string, tech: string, cli: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;
const AAL1 = { aal: "aal1" as const };

/** Lo que hace `saveSettingAction`: UPDATE de value/is_public y, si no existía, INSERT. */
async function save(key: string, value: unknown, isPublic: boolean) {
  const upd = await db.query(`update app_settings set value = $2::jsonb, is_public = $3 where key = $1 returning key`, [key, JSON.stringify(value), isPublic]);
  if (upd.rows.length) return;
  await db.query(`insert into app_settings (key, value, is_public) values ($1, $2::jsonb, $3)`, [key, JSON.stringify(value), isPublic]);
}
/** La operación que emite supabase-js en `.upsert({…}, { onConflict: "key" })` (la causa del error original). */
const legacyUpsert = (key: string) =>
  q(`insert into app_settings (key, value, is_public) values ($1, '"x"'::jsonb, true) on conflict (key) do update set key = excluded.key, value = excluded.value, is_public = excluded.is_public`, [key]);

const FIELDS = [
  ["business.name", "TechnoUltra"],
  ["business.phone", "3183943465"],
  ["business.email", "contacto@technoultra.com"],
  ["business.address", "Cra 1A 59-60"],
] as const;

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@technoultra.com");
  await makeAdmin(db, owner);
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, owner, tech);
  cli = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
}, 180000);

describe("causa raíz del error «No pudimos guardar el ajuste»", () => {
  it("el upsert de supabase-js exige UPDATE sobre la columna `key`, que no se concede: falla incluso para el SUPERADMIN", async () => {
    await expect(as(db, owner, () => legacyUpsert("business.name"))).rejects.toThrow(/permission denied for table app_settings/);
  });
  it("el SUPERADMIN SÍ puede insertar y actualizar value/is_public por separado", async () => {
    await as(db, owner, () => save("business.probe", "a", true));
    await as(db, owner, () => save("business.probe", "b", true));
    expect((await q<{ v: string }>(`select value #>> '{}' v from app_settings where key = 'business.probe'`))[0].v).toBe("b");
  });
});

describe("ajustes del negocio (app_settings)", () => {
  it("SUPERADMIN: guarda, vuelve a guardar y persiste cada campo público del negocio", async () => {
    for (const [key, value] of FIELDS) {
      await as(db, owner, () => save(key, value, true)); // alta
      await as(db, owner, () => save(key, `${value}`, true)); // segunda vez: actualiza
      expect((await q<{ v: string }>(`select value #>> '{}' v from app_settings where key = $1`, [key]))[0].v).toBe(value);
    }
  });
  it("lectura pública: anon y clientes leen SOLO los públicos (antes anon recibía 42501)", async () => {
    await as(db, owner, () => save("orders.pending_hours", 12, false));
    for (const who of [null, cli]) {
      const rows = await as(db, who, () => q<{ key: string }>(`select key from app_settings order by key`));
      const keys = rows.map((r) => r.key);
      for (const [k] of FIELDS) expect(keys).toContain(k);
      expect(keys).not.toContain("orders.pending_hours");
    }
    expect((await as(db, owner, () => q(`select 1 from app_settings where key = 'orders.pending_hours'`))).length).toBe(1);
    expect((await as(db, tech, () => q(`select 1 from app_settings where key = 'orders.pending_hours'`))).length).toBe(0);
  });
  it("el trigger sella quién y cuándo, y el cambio queda en la auditoría", async () => {
    const [row] = await q<{ updated_by: string }>(`select updated_by from app_settings where key = 'business.name'`);
    expect(row.updated_by).toBe(owner);
    expect((await q(`select 1 from audit_logs where entity_type = 'app_settings' and entity_id = 'business.name'`)).length).toBeGreaterThan(0);
  });
  it("TECHNICIAN: lee lo público pero no crea ni modifica ajustes", async () => {
    expect((await as(db, tech, () => q(`select 1 from app_settings where key = 'business.name'`))).length).toBe(1);
    await expect(as(db, tech, () => save("business.slogan", "x", true))).rejects.toThrow(denied);
    await as(db, tech, () => q(`update app_settings set value = '"Hackeado"' where key = 'business.name'`)); // RLS: 0 filas
    expect((await q<{ v: string }>(`select value #>> '{}' v from app_settings where key = 'business.name'`))[0].v).toBe("TechnoUltra");
  });
  it("CLIENT: no crea ni modifica ajustes", async () => {
    await expect(as(db, cli, () => save("business.slogan", "x", true))).rejects.toThrow(denied);
    await as(db, cli, () => q(`update app_settings set value = '"Hackeado"' where key = 'business.name'`));
    expect((await q<{ v: string }>(`select value #>> '{}' v from app_settings where key = 'business.name'`))[0].v).toBe("TechnoUltra");
  });
  it("anon no puede escribir", async () => {
    await expect(as(db, null, () => save("business.slogan", "x", true))).rejects.toThrow(denied);
  });
  it("sin MFA (aal1) ni el SUPERADMIN modifica ajustes", async () => {
    await as(db, owner, () => q(`update app_settings set value = '"SinMFA"' where key = 'business.name'`), AAL1);
    expect((await q<{ v: string }>(`select value #>> '{}' v from app_settings where key = 'business.name'`))[0].v).toBe("TechnoUltra");
    await expect(as(db, owner, () => save("business.slogan", "x", true), AAL1)).rejects.toThrow(denied);
  });
  it("la clave de un ajuste no cambia y los ajustes no se eliminan desde la API", async () => {
    await expect(as(db, owner, () => q(`update app_settings set key = 'business.otro' where key = 'business.name'`))).rejects.toThrow(denied);
    await expect(as(db, owner, () => q(`delete from app_settings where key = 'business.name'`))).rejects.toThrow(denied);
  });
});

describe("el mismo defecto en otras pantallas (upsert) quedó corregido con el patrón actualizar-o-insertar", () => {
  it("preferencias de avisos del cliente: el upsert falla, actualizar-o-insertar funciona", async () => {
    await expect(
      as(db, cli, () => q(`insert into notification_preferences (profile_id, email_enabled) values ($1, true) on conflict (profile_id) do update set profile_id = excluded.profile_id, email_enabled = excluded.email_enabled`, [cli])),
    ).rejects.toThrow(denied);
    await as(db, cli, async () => {
      const upd = await db.query(`update notification_preferences set email_enabled = false where profile_id = $1 returning profile_id`, [cli]);
      if (!upd.rows.length) await db.query(`insert into notification_preferences (profile_id, email_enabled) values ($1, false)`, [cli]);
    });
    expect((await q<{ e: boolean }>(`select email_enabled e from notification_preferences where profile_id = $1`, [cli]))[0].e).toBe(false);
  });
});
