import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let admin: string, tech: string, tech2: string, cliA: string, cliB: string, custA: string, svc: string, ticketA: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;
const AAL1 = { aal: "aal1" as const };

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, "admin@technoultra.com");
  await makeAdmin(db, admin);
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
    await expect(as(db, admin, () => q(`select public.log_admin_event($1,'superadmin.security_changed')`, [admin]))).rejects.toThrow(denied);
    await expect(q(`select public.log_admin_event($1,'superadmin.security_changed')`, [tech])).rejects.toThrow(/forbidden/);
    await q(`select public.log_admin_event($1,'superadmin.security_changed',$2,'{"scope":"mfa_reset","password":"x"}')`, [admin, tech]);
    const [row] = await q<{ metadata: Record<string, string> }>(`select metadata from audit_logs where action = 'superadmin.security_changed' order by id desc limit 1`);
    expect(row.metadata).toEqual({ scope: "mfa_reset", target_user: tech });
  });
  it("la cadena de auditoría sigue íntegra", async () => {
    const [{ ok }] = await q<{ ok: boolean }>(`select private.verify_audit_chain() ok`);
    expect(ok).toBe(true);
  });
});

describe("gestión de personal: sin escalamiento de privilegios", () => {
  it("el SUPERADMIN es único: no se puede crear, modificar ni degradar desde la aplicación", async () => {
    await expect(q(`select public.admin_provision_staff($1,$1,'technician','Dueño',null,null)`, [admin])).rejects.toThrow(/cannot_modify_superadmin/);
    await expect(q(`select public.admin_provision_staff($1,$2,'superadmin','Otro',null,null)`, [admin, tech])).rejects.toThrow(/invalid_role/);
    await expect(q(`select public.admin_provision_staff($1,$2,'technician','Dueño',null,null)`, [tech, admin])).rejects.toThrow(/forbidden/); // un técnico no gestiona personal
    const otro = await createUser(db, "otro@technoultra.com");
    await expect(makeAdmin(db, otro)).rejects.toThrow(/profiles_single_superadmin/); // ni siquiera con acceso directo a la BD
    expect((await q<{ role: string }>(`select role from profiles where id = $1`, [admin]))[0].role).toBe("superadmin");
  });
  it("registra superadmin.user_created y superadmin.role_changed con actor, usuario, rol anterior y nuevo", async () => {
    const nuevo = await createUser(db, "nuevo@gmail.com", { full_name: "Nuevo" });
    await q(`select public.admin_provision_staff($1,$2,'technician','Nuevo Técnico',null,null)`, [admin, nuevo]);
    const [row] = await q<{ metadata: Record<string, string>; actor_id: string; entity_id: string }>(`select metadata, actor_id, entity_id from audit_logs where action = 'superadmin.user_created' order by id desc limit 1`);
    expect(row.actor_id).toBe(admin);
    expect(row.entity_id).toBe(nuevo);
    expect(row.metadata).toMatchObject({ old_role: "client", new_role: "technician", target_user: nuevo });
    const actions = (await q<{ action: string }>(`select action from audit_logs`)).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["superadmin.user_created", "staff.provisioned"]));
    expect(actions.filter((x) => x.startsWith("admin."))).toEqual([]); // el nombre «admin.*» ya no se usa
  });
  it("los eventos de acceso del propietario se registran como superadmin.* y los del técnico como staff.*", async () => {
    await as(db, admin, () => q(`select public.log_staff_event('staff.login', '{"method":"password"}')`));
    await as(db, tech, () => q(`select public.log_staff_event('staff.login', '{"method":"password"}')`), AAL1);
    const rows = await q<{ action: string; actor_role: string }>(`select action, actor_role from audit_logs where action in ('superadmin.login','staff.login') order by id`);
    expect(rows).toEqual(expect.arrayContaining([{ action: "superadmin.login", actor_role: "superadmin" }, { action: "staff.login", actor_role: "technician" }]));
  });
  it("un cliente o técnico no puede cambiar roles desde la API", async () => {
    for (const who of [cliA, tech]) {
      await expect(as(db, who, () => q(`select public.admin_provision_staff($1,$2,'superadmin','X',null,null)`, [who, who]))).rejects.toThrow(denied);
      await as(db, who, () => q(`update profiles set role = 'superadmin' where id = $1`, [who])).catch(() => undefined);
      expect((await q<{ role: string }>(`select role from profiles where id = $1`, [who]))[0].role).not.toBe("superadmin");
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
    const r = await q<{ n: string }>(`select p.proname n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname in ('admin_provision_staff','admin_set_user_active','log_admin_event','record_diagnosis_payment','bootstrap_first_superadmin') and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute'))`);
    expect(r).toEqual([]);
  });
});
