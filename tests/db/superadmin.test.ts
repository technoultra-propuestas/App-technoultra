import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let owner: string, tech: string, cli: string, cliB: string, custA: string, svc: string, ticket: string, cat: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;
const AAL1 = { aal: "aal1" as const };

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@technoultra.com");
  await makeAdmin(db, owner); // = SUPERADMIN (propietario único)
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, owner, tech);
  cli = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
  cliB = await createUser(db, "b@gmail.com", { full_name: "Cliente B" });
  custA = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cli]))[0].id;
  cat = (await q<{ id: string }>(`insert into service_categories (slug, name, kind) values ('cat-sa','Categoría SA','technical') returning id`))[0].id;
  svc = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment, category_id) values ('svc-sa','Servicio SA','technical',50000,'{store}',false,$1) returning id`, [cat]))[0].id;
  ticket = (await q<{ id: string }>(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','Falla de prueba',$3) returning id`, [custA, svc, tech]))[0].id;
}, 180000);

describe("jerarquía definitiva: SUPERADMIN > TECHNICIAN > CLIENT", () => {
  it("el rol ADMIN ya no existe: el enum tiene exactamente client, technician y superadmin", async () => {
    const labels = (await q<{ l: string }>(`select enumlabel l from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'app_role' order by enumsortorder`)).map((r) => r.l);
    expect(labels.sort()).toEqual(["client", "superadmin", "technician"]);
    await expect(q(`select 'admin'::public.app_role`)).rejects.toThrow(/invalid input value for enum/);
    await expect(q(`select 'owner'::public.app_role`)).rejects.toThrow(/invalid input value for enum/);
  });
  it("ninguna función conserva referencias al rol antiguo y no existe is_admin()", async () => {
    const old = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and (p.prosrc like '%''admin''%' or p.prosrc like '%is_admin(%')`);
    expect(old).toEqual([]);
    expect((await q(`select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_admin'`)).length).toBe(0);
    expect((await q<{ r: boolean }>(`select private.is_superadmin() r`))[0].r).toBe(false); // sin sesión
  });
  it("existe un único SUPERADMIN y es el propietario", async () => {
    expect(Number((await q<{ n: string }>(`select count(*) n from profiles where role = 'superadmin'`))[0].n)).toBe(1);
  });
});

describe("SUPERADMIN (con MFA)", () => {
  it("tiene acceso administrativo completo mediante RLS", async () => {
    expect((await as(db, owner, () => q(`select private.my_role() r`)))[0]).toEqual({ r: "superadmin" });
    expect((await as(db, owner, () => q(`select id from customers`))).length).toBeGreaterThan(0);
    expect((await as(db, owner, () => q(`select id from tickets`))).length).toBe(1);
    expect((await as(db, owner, () => q(`select id from audit_logs limit 1`))).length).toBe(1);
    expect((await as(db, owner, () => q(`select id from profiles`))).length).toBeGreaterThanOrEqual(4);
  });
  it("gestiona servicios, categorías, cobertura, configuración, urgencias y comercial", async () => {
    await as(db, owner, () => q(`update services set base_price = 55000 where id = $1`, [svc]));
    expect((await q<{ p: string }>(`select base_price p from services where id = $1`, [svc]))[0].p).toBe("55000.00");
    await as(db, owner, () => q(`insert into service_subcategories (category_id, slug, name) values ($1,'sub-sa','Sub SA')`, [cat]));
    await as(db, owner, () => q(`update coverage_areas set home_fee = 16000 where dane_code = '76001'`));
    expect((await q<{ f: string }>(`select home_fee f from coverage_areas where dane_code = '76001'`))[0].f).toBe("16000.00");
    await as(db, owner, () => q(`update app_settings set value = 'true' where key = 'tax.vat_responsible'`));
    expect((await q<{ v: string }>(`select value::text v from app_settings where key = 'tax.vat_responsible'`))[0].v).toBe("true");
    await q(`update app_settings set value = 'false' where key = 'tax.vat_responsible'`);
    await as(db, owner, () => q(`update urgency_levels set percent = 10 where code = 'prioritaria'`));
    expect((await q<{ p: string }>(`select percent p from urgency_levels where code = 'prioritaria'`))[0].p).toBe("10.00");
    await q(`update urgency_levels set percent = 0 where code = 'prioritaria'`);
  });
  it("gestiona técnicos: alta, desactivación y reactivación (solo técnicos, con auditoría)", async () => {
    const t2 = await createUser(db, "t2@gmail.com", { full_name: "Futuro técnico" });
    await q(`select public.admin_provision_staff($1,$2,'technician','Técnico Dos',null,'Banco de trabajo')`, [owner, t2]);
    expect((await q<{ role: string }>(`select role from profiles where id = $1`, [t2]))[0].role).toBe("technician");
    await q(`select public.admin_set_user_active($1,$2,false)`, [owner, t2]);
    expect((await as(db, t2, () => q(`select private.my_role() r`)))[0]).toEqual({ r: null }); // desactivado = sin rol
    await q(`select public.admin_set_user_active($1,$2,true)`, [owner, t2]);
    expect((await as(db, t2, () => q(`select private.my_role() r`)))[0]).toEqual({ r: "technician" });
    const actions = (await q<{ action: string }>(`select action from audit_logs`)).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["superadmin.user_created", "superadmin.user_disabled", "superadmin.user_enabled"]));
  });
  it("sin MFA (aal1) el SUPERADMIN no tiene ningún privilegio", async () => {
    expect((await as(db, owner, () => q(`select private.my_role() r`), AAL1))[0]).toEqual({ r: null });
    expect((await as(db, owner, () => q(`select id from tickets`), AAL1)).length).toBe(0);
    expect((await as(db, owner, () => q(`select id from audit_logs`), AAL1)).length).toBe(0);
    await as(db, owner, () => q(`update services set base_price = 1 where id = $1`, [svc]), AAL1);
    expect((await q<{ p: string }>(`select base_price p from services where id = $1`, [svc]))[0].p).not.toBe("1.00");
    await expect(as(db, owner, () => q(`select public.delete_service($1)`, [svc]), AAL1)).rejects.toThrow(denied);
  });
});

describe("TECHNICIAN: operativo, sin funciones de propietario", () => {
  it("accede a sus tickets pero no a configuración global, roles, auditoría ni otros usuarios", async () => {
    expect((await as(db, tech, () => q(`select id from tickets`))).length).toBe(1);
    expect((await as(db, tech, () => q(`select id from audit_logs`))).length).toBe(0);
    expect((await as(db, tech, () => q(`select id from profiles where id <> $1`, [tech]))).length).toBe(0);
    await as(db, tech, () => q(`update app_settings set value = 'true' where key = 'tax.vat_responsible'`));
    expect((await q<{ v: string }>(`select value::text v from app_settings where key = 'tax.vat_responsible'`))[0].v).toBe("false");
    await as(db, tech, () => q(`update urgency_levels set percent = 99`));
    expect((await q<{ p: string }>(`select max(percent) p from urgency_levels`))[0].p).not.toBe("99.00");
    await as(db, tech, () => q(`update coverage_areas set home_fee = 1`));
    expect((await q<{ f: string }>(`select min(home_fee) f from coverage_areas`))[0].f).not.toBe("1.00");
    await as(db, tech, () => q(`update services set base_price = 1 where id = $1`, [svc]));
    expect((await q<{ p: string }>(`select base_price p from services where id = $1`, [svc]))[0].p).not.toBe("1.00");
  });
  it("no puede gestionar roles ni convertirse en SUPERADMIN por ningún camino", async () => {
    await expect(as(db, tech, () => q(`update profiles set role = 'superadmin' where id = $1`, [tech]))).rejects.toThrow(denied);
    await expect(as(db, tech, () => q(`select public.admin_provision_staff($1,$1,'technician','x',null,null)`, [tech]))).rejects.toThrow(denied);
    await expect(as(db, tech, () => q(`select public.bootstrap_first_superadmin($1)`, [tech]))).rejects.toThrow(denied);
    await expect(as(db, tech, () => q(`insert into role_permissions (role, permission_code) values ('technician','users.manage')`))).rejects.toThrow(denied);
    expect((await q<{ r: string }>(`select role r from profiles where id = $1`, [tech]))[0].r).toBe("technician");
    await expect(q(`select public.bootstrap_first_superadmin($1)`, [tech])).rejects.toThrow(/superadmin_already_exists/);
  });
  it("no ejecuta operaciones exclusivas del propietario", async () => {
    for (const sql of [
      `select public.delete_service('${svc}')`,
      `select public.anonymize_customer('${custA}')`,
      `select public.admin_set_user_active('${tech}','${owner}',false)`,
      `select public.log_admin_event('${tech}','superadmin.security_changed')`,
    ]) await expect(as(db, tech, () => q(sql))).rejects.toThrow(denied);
    await expect(as(db, tech, () => q(`insert into services (slug, name, kind, base_price, allowed_modalities) values ('x-x','Servicio X','technical',1,'{store}')`))).rejects.toThrow(denied);
    await expect(as(db, tech, () => q(`insert into audit_logs (action, entity_type, row_hash) values ('x','x','\\x00')`))).rejects.toThrow(denied);
  });
});

describe("CLIENT", () => {
  it("solo ve lo suyo y no puede elevarse ni administrar", async () => {
    expect((await as(db, cli, () => q(`select id from tickets`))).length).toBe(1);
    expect((await as(db, cliB, () => q(`select id from tickets`))).length).toBe(0); // IDOR
    expect((await as(db, cli, () => q(`select id from profiles`))).length).toBe(1);
    await expect(as(db, cli, () => q(`update profiles set role = 'technician' where id = $1`, [cli]))).rejects.toThrow(denied);
    await expect(as(db, cli, () => q(`update profiles set role = 'superadmin' where id = $1`, [cli]))).rejects.toThrow(denied);
    await expect(as(db, cli, () => q(`select public.admin_provision_staff($1,$1,'technician','x',null,null)`, [cli]))).rejects.toThrow(denied);
    await expect(as(db, cli, () => q(`insert into staff_members (profile_id) values ($1)`, [cli]))).rejects.toThrow(denied);
    expect((await as(db, cli, () => q(`select id from audit_logs`))).length).toBe(0);
  });
  it("anon no ve datos privados", async () => {
    for (const t of ["tickets", "customers", "profiles", "quotes", "payments", "documents", "audit_logs", "staff_members"]) {
      await as(db, null, () => q(`select id from ${t === "staff_members" ? "staff_members" : t} limit 1`).catch(() => [])).then((r) => expect(r.length).toBe(0));
    }
  });
});

describe("RLS: el nuevo modelo sigue cerrado", () => {
  it("todas las tablas con RLS y ninguna política abierta", async () => {
    expect((await q(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and not relrowsecurity`)).length).toBe(0);
    expect((await q(`select policyname from pg_policies where schemaname='public' and (qual = 'true' or with_check = 'true')`)).length).toBe(0);
  });
  it("las políticas administrativas se apoyan en is_superadmin()", async () => {
    const [{ n }] = await q<{ n: string }>(`select count(*) n from pg_policies where schemaname='public' and (qual like '%is_superadmin%' or with_check like '%is_superadmin%')`);
    expect(Number(n)).toBeGreaterThan(40);
  });
});
