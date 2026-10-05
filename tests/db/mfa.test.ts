import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let admin: string, admin2: string, tech: string, tech2: string, cliA: string, cliB: string, custA: string, svc: string, ticketA: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;
const AAL1 = { aal: "aal1" as const };

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, "admin@technoultra.com");
  await makeAdmin(db, admin);
  admin2 = await createUser(db, "admin2@technoultra.com");
  await makeAdmin(db, admin2);
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, admin, tech);
  tech2 = await createUser(db, "tec2@technoultra.com");
  await makeTechnician(db, admin, tech2);
  cliA = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
  cliB = await createUser(db, "b@gmail.com", { full_name: "Cliente B" });
  custA = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliA]))[0].id;
  svc = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment) values ('mfa-svc','Servicio MFA','technical',50000,'{store}',false) returning id`))[0].id;
  ticketA = (await q<{ id: string }>(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','Falla de prueba',$3) returning id`, [custA, svc, tech]))[0].id;
}, 180000);

describe("MFA obligatorio para el personal (AAL2 en la base de datos)", () => {
  it("con AAL1 el personal no tiene rol: ni ve ni modifica datos de gestión", async () => {
    for (const who of [admin, tech]) {
      expect((await as(db, who, () => q(`select private.my_role() r`), AAL1))[0]).toEqual({ r: null });
      expect((await as(db, who, () => q(`select id from tickets`), AAL1)).length).toBe(0);
      expect((await as(db, who, () => q(`select id from customers`), AAL1)).length).toBe(0);
      expect((await as(db, who, () => q(`select id from audit_logs`), AAL1)).length).toBe(0);
    }
    // con AAL2 sí
    expect((await as(db, tech, () => q(`select private.my_role() r`), { aal: "aal2" }))[0]).toEqual({ r: "technician" });
    expect((await as(db, admin, () => q(`select id from tickets`), { aal: "aal2" })).length).toBe(1);
  });
  it("con AAL1 un administrador no puede cambiar configuración ni llamar funciones administrativas", async () => {
    await as(db, admin, () => q(`update app_settings set value = 'true' where key = 'tax.vat_responsible'`), AAL1);
    expect((await q<{ v: string }>(`select value::text v from app_settings where key = 'tax.vat_responsible'`))[0].v).toBe("false");
    await expect(as(db, admin, () => q(`select public.delete_service($1)`, [svc]), AAL1)).rejects.toThrow(denied);
    await expect(as(db, admin, () => q(`select public.anonymize_customer($1)`, [custA]), AAL1)).rejects.toThrow(denied);
    await expect(as(db, admin, () => q(`insert into urgency_levels (code, label) values ('mfa_test','Prueba MFA')`), AAL1)).rejects.toThrow(denied);
  });
  it("con AAL1 el técnico no puede operar tickets ni cotizaciones", async () => {
    await expect(as(db, tech, () => q(`select public.transition_ticket($1,'diagnosing')`, [ticketA]), AAL1)).rejects.toThrow(denied);
    await expect(as(db, tech, () => q(`insert into quotes (ticket_id, customer_id) values ($1,$2)`, [ticketA, custA]), AAL1)).rejects.toThrow(denied);
  });
  it("el cliente no necesita MFA y sigue accediendo a lo suyo", async () => {
    expect((await as(db, cliA, () => q(`select private.my_role() r`), AAL1))[0]).toEqual({ r: "client" });
    expect((await as(db, cliA, () => q(`select id from tickets`), AAL1)).length).toBe(1);
    expect((await as(db, cliB, () => q(`select id from tickets`), AAL1)).length).toBe(0); // IDOR: no ve el ticket ajeno
  });
  it("el personal con AAL1 aún puede leer su propio perfil (para saber que debe completar MFA)", async () => {
    const rows = await as(db, tech, () => q<{ role: string }>(`select role from profiles`), AAL1);
    expect(rows).toEqual([{ role: "technician" }]);
  });
});

describe("auditoría de accesos del personal", () => {
  it("solo el personal registra eventos; lista cerrada y sin datos sensibles", async () => {
    await as(db, tech, () => q(`select public.log_staff_event('staff.mfa_failure', '{"method":"totp","password":"secreta","code":"123456","token":"abc"}')`), AAL1);
    const [row] = await q<{ metadata: Record<string, string>; actor_role: string }>(`select metadata, actor_role from audit_logs where action = 'staff.mfa_failure' order by id desc limit 1`);
    expect(row.actor_role).toBe("technician");
    expect(row.metadata).toEqual({ method: "totp" });
    await expect(as(db, tech, () => q(`select public.log_staff_event('admin.role_changed')`), AAL1)).rejects.toThrow(/invalid_event/);
    await expect(as(db, cliA, () => q(`select public.log_staff_event('staff.login')`))).rejects.toThrow(denied);
    await expect(as(db, null, () => q(`select public.log_staff_event('staff.login')`))).rejects.toThrow(denied);
  });
  it("log_admin_event es solo del servidor y exige un administrador como actor", async () => {
    await expect(as(db, admin, () => q(`select public.log_admin_event($1,'admin.security_changed')`, [admin]))).rejects.toThrow(denied);
    await expect(q(`select public.log_admin_event($1,'admin.security_changed')`, [tech])).rejects.toThrow(/forbidden/);
    await q(`select public.log_admin_event($1,'admin.security_changed',$2,'{"scope":"mfa_reset","password":"x"}')`, [admin, tech]);
    const [row] = await q<{ metadata: Record<string, string> }>(`select metadata from audit_logs where action = 'admin.security_changed' order by id desc limit 1`);
    expect(row.metadata).toEqual({ scope: "mfa_reset" });
  });
  it("la cadena de auditoría sigue íntegra", async () => {
    const [{ ok }] = await q<{ ok: boolean }>(`select private.verify_audit_chain() ok`);
    expect(ok).toBe(true);
  });
});

describe("gestión de personal: sin escalamiento de privilegios", () => {
  it("nadie cambia su propio rol ni deja al sistema sin administradores", async () => {
    await expect(q(`select public.admin_provision_staff($1,$1,'technician','Admin',null,null)`, [admin])).rejects.toThrow(/cannot_change_own_role/);
    await q(`select public.admin_provision_staff($1,$2,'technician','Admin 2',null,null)`, [admin, admin2]);
    expect((await q<{ role: string }>(`select role from profiles where id = $1`, [admin2]))[0].role).toBe("technician");
    await q(`select public.admin_provision_staff($1,$2,'admin','Admin 2',null,null)`, [admin, admin2]);
    await q(`update profiles set is_active = false where id = $1`, [admin2]);
    await expect(q(`select public.admin_provision_staff($1,$2,'technician','Admin',null,null)`, [admin2, admin])).rejects.toThrow(/forbidden/); // un admin inactivo no actúa
    await q(`update profiles set is_active = true where id = $1`, [admin2]);
  });
  it("registra admin.user_created y admin.role_changed", async () => {
    const actions = (await q<{ action: string }>(`select action from audit_logs`)).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["admin.user_created", "admin.role_changed", "staff.provisioned"]));
  });
  it("un cliente o técnico no puede cambiar roles desde la API", async () => {
    for (const who of [cliA, tech]) {
      await expect(as(db, who, () => q(`select public.admin_provision_staff($1,$2,'admin','X',null,null)`, [who, who]))).rejects.toThrow(denied);
      await as(db, who, () => q(`update profiles set role = 'admin' where id = $1`, [who])).catch(() => undefined);
      expect((await q<{ role: string }>(`select role from profiles where id = $1`, [who]))[0].role).not.toBe("admin");
      await expect(as(db, who, () => q(`insert into staff_members (profile_id) values ($1)`, [who]))).rejects.toThrow(denied);
    }
  });
  it("un técnico no ve a otro técnico ni la tabla de personal, y no modifica permisos", async () => {
    expect((await as(db, tech, () => q(`select profile_id from staff_members`))).every((r) => (r as { profile_id: string }).profile_id === tech)).toBe(true);
    expect((await as(db, tech, () => q(`select id from profiles where id = $1`, [tech2]))).length).toBe(0);
    await as(db, tech, () => q(`insert into role_permissions (role, permission_code) values ('technician','users.manage')`)).catch(() => undefined);
    expect((await q(`select 1 from role_permissions where role = 'technician' and permission_code = 'users.manage'`)).length).toBe(0);
  });
  it("las funciones de gestión de usuarios no son ejecutables desde la API", async () => {
    const r = await q<{ n: string }>(`select p.proname n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname in ('admin_provision_staff','admin_set_user_active','log_admin_event','record_diagnosis_payment','bootstrap_first_admin') and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute'))`);
    expect(r).toEqual([]);
  });
});
