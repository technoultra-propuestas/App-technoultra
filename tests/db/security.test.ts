import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

/**
 * Pruebas de seguridad de la base de datos (RLS, anti-escalada, IDOR, máquina de estados, cobertura, dinero, auditoría).
 * Cada prueba actúa como el rol real de PostgREST (authenticated/anon) con claims JWT.
 */
let db: Db;
let admin: string, techA: string, techB: string, cliA: string, cliB: string;
let custA: string,
  custB: string,
  addrCaliA: string,
  addrBogotaA: string,
  addrB: string,
  eqA: string,
  eqB: string;
let svcPhysical: string, svcRemote: string, svcNoQuote: string, prodSsd: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|privileged_column|forbidden|immutable|42501/i;

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, "admin@technoultra.com", { full_name: "Admin" });
  await makeAdmin(db, admin);
  techA = await createUser(db, "tecA@technoultra.com");
  techB = await createUser(db, "tecB@technoultra.com");
  await makeTechnician(db, admin, techA);
  await makeTechnician(db, admin, techB);
  cliA = await createUser(db, "a@gmail.com", { full_name: "Cliente A", role: "admin" }); // intento de auto-asignar rol vía metadata
  cliB = await createUser(db, "b@gmail.com", { full_name: "Cliente B" });
  custA = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliA]))[0].id;
  custB = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliB]))[0].id;

  addrCaliA = (
    await q<{ id: string }>(
      `insert into addresses (customer_id, line1, city_name, department, dane_code) values ($1,'Cra 66 #10-25','Cali','Valle del Cauca','76001') returning id`,
      [custA],
    )
  )[0].id;
  addrBogotaA = (
    await q<{ id: string }>(
      `insert into addresses (customer_id, line1, city_name, department, dane_code) values ($1,'Calle 80 #10-25','Bogotá','Bogotá D.C.','11001') returning id`,
      [custA],
    )
  )[0].id;
  addrB = (
    await q<{ id: string }>(
      `insert into addresses (customer_id, line1, city_name, department, dane_code) values ($1,'Calle 5 #38-14','Cali','Valle del Cauca','76001') returning id`,
      [custB],
    )
  )[0].id;
  eqA = (
    await q<{ id: string }>(
      `insert into equipment (customer_id, type, brand, model) values ($1,'laptop','HP','14-R005LA') returning id`,
      [custA],
    )
  )[0].id;
  eqB = (
    await q<{ id: string }>(
      `insert into equipment (customer_id, type, brand, model) values ($1,'laptop','Lenovo','IdeaPad 3') returning id`,
      [custB],
    )
  )[0].id;

  svcPhysical = (
    await q<{ id: string }>(
      `insert into services (slug, name, kind, base_price, allowed_modalities, default_warranty_days) values ('mant-pc','Mantenimiento preventivo','technical',70000,'{store,pickup,home}',30) returning id`,
    )
  )[0].id;
  svcRemote = (
    await q<{ id: string }>(
      `insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment) values ('soporte-remoto','Soporte remoto','technical',50000,'{remote}',false) returning id`,
    )
  )[0].id;
  svcNoQuote = (
    await q<{ id: string }>(
      `insert into services (slug, name, kind, base_price, allowed_modalities, requires_quote) values ('optim','Optimización','technical',50000,'{store,pickup,home}',false) returning id`,
    )
  )[0].id;
  prodSsd = (
    await q<{ id: string }>(
      `insert into products (sku, slug, name, price, warranty_days) values ('SSD480','ssd-480','SSD 480 GB',189000,365) returning id`,
    )
  )[0].id;
}, 180000);

describe("identidad y anti-escalada de privilegios", () => {
  it("todo registro nace como cliente; el rol en user_metadata se ignora", async () => {
    const [p] = await q<{ role: string }>(`select role from profiles where id = $1`, [cliA]);
    expect(p.role).toBe("client");
  });

  it("el cliente no puede cambiarse el rol ni reactivarse", async () => {
    await expect(
      as(db, cliA, () => q(`update profiles set role = 'admin' where id = $1`, [cliA])),
    ).rejects.toThrow(denied);
    await expect(
      as(db, cliA, () => q(`update profiles set is_active = true where id = $1`, [cliA])),
    ).rejects.toThrow(denied);
    await expect(
      as(db, cliA, () => q(`update profiles set email = 'x@x.com' where id = $1`, [cliA])),
    ).rejects.toThrow(denied);
    const [p] = await q<{ role: string }>(`select role from profiles where id = $1`, [cliA]);
    expect(p.role).toBe("client");
  });

  it("el cliente sí puede editar su nombre pero no el de otro", async () => {
    await as(db, cliA, () => q(`update profiles set full_name = 'Cliente Uno' where id = $1`, [cliA]));
    const rows = await as(db, cliA, () =>
      q(`update profiles set full_name = 'Hack' where id = $1 returning id`, [cliB]),
    );
    expect(rows).toHaveLength(0);
  });

  it("un cliente no puede provisionar personal ni desactivar usuarios (funciones solo service_role)", async () => {
    await expect(
      as(db, cliA, () => q(`select public.admin_provision_staff($1,$2,'admin','x')`, [cliA, cliA])),
    ).rejects.toThrow(denied);
    await expect(
      as(db, admin, () => q(`select public.admin_set_user_active($1,$2,false)`, [admin, cliA])),
    ).rejects.toThrow(denied);
  });

  it("no se puede desactivar al último administrador ni a uno mismo", async () => {
    await expect(q(`select public.admin_set_user_active($1,$1,false)`, [admin])).rejects.toThrow(
      /cannot_deactivate_self/,
    );
    await expect(q(`select public.admin_set_user_active($1,$2,false)`, [techA, admin])).rejects.toThrow(
      /forbidden/,
    );
  });

  it("un cliente no puede reasignar su ficha a otro perfil", async () => {
    await expect(
      as(db, cliA, () => q(`update customers set profile_id = $1 where id = $2`, [cliB, custA])),
    ).rejects.toThrow(denied);
  });
});

describe("aislamiento horizontal (IDOR)", () => {
  it("cada cliente ve solo sus propios datos", async () => {
    expect(await as(db, cliA, () => q(`select id from customers`))).toHaveLength(1);
    expect(await as(db, cliA, () => q(`select id from equipment`))).toHaveLength(1);
    expect(await as(db, cliA, () => q(`select id from addresses`))).toHaveLength(2);
    expect(await as(db, cliA, () => q(`select id from equipment where id = $1`, [eqB]))).toHaveLength(0);
    expect(await as(db, cliA, () => q(`select id from profiles`))).toHaveLength(1);
  });

  it("no puede crear equipos ni direcciones a nombre de otro cliente", async () => {
    await expect(
      as(db, cliA, () =>
        q(`insert into equipment (customer_id, type, brand, model) values ($1,'laptop','X','Y')`, [custB]),
      ),
    ).rejects.toThrow(denied);
    await expect(
      as(db, cliA, () =>
        q(
          `insert into addresses (customer_id, line1, city_name, department, dane_code) values ($1,'Calle 1 # 2-3','Cali','Valle','76001')`,
          [custB],
        ),
      ),
    ).rejects.toThrow(denied);
  });

  it("anónimo: lee catálogo y cobertura pero no datos privados", async () => {
    expect((await as(db, null, () => q(`select id from services`))).length).toBeGreaterThan(0);
    expect((await as(db, null, () => q(`select id from coverage_areas`))).length).toBe(4);
    await expect(as(db, null, () => q(`select id from profiles`))).rejects.toThrow(denied);
    await expect(as(db, null, () => q(`select id from tickets`))).rejects.toThrow(denied);
    await expect(as(db, null, () => q(`select id from audit_logs`))).rejects.toThrow(denied);
  });

  it("cliente no ve auditoría ni pagos ajenos; no puede escribir pagos", async () => {
    expect(await as(db, cliA, () => q(`select id from audit_logs`))).toHaveLength(0);
    await expect(
      as(db, cliA, () =>
        q(
          `insert into payments (customer_id, provider, amount, quote_id) values ($1,'manual',1000,gen_random_uuid())`,
          [custA],
        ),
      ),
    ).rejects.toThrow(denied);
    await expect(
      as(db, admin, () =>
        q(`insert into payments (customer_id, provider, amount) values ($1,'manual',1000)`, [custA]),
      ),
    ).rejects.toThrow(denied);
  });
});

describe("cobertura geográfica (validada en base de datos)", () => {
  const ins = (cust: string, svc: string, modality: string, addr: string | null, eq: string | null) =>
    q(
      `insert into service_requests (customer_id, service_id, equipment_id, modality, address_id, problem_description) values ($1,$2,$3,$4,$5,'No enciende bien')`,
      [cust, svc, eq, modality, addr],
    );

  it("permite recogida en Cali", async () => {
    await as(db, cliA, () => ins(custA, svcPhysical, "pickup", addrCaliA, eqA));
  });
  it("rechaza servicios físicos fuera de cobertura (Bogotá)", async () => {
    await expect(as(db, cliA, () => ins(custA, svcPhysical, "pickup", addrBogotaA, eqA))).rejects.toThrow(
      /out_of_coverage/,
    );
    await expect(as(db, cliA, () => ins(custA, svcPhysical, "store", addrBogotaA, eqA))).rejects.toThrow(
      /out_of_coverage/,
    );
  });
  it("el soporte remoto no requiere dirección y es nacional", async () => {
    await as(db, cliA, () => ins(custA, svcRemote, "remote", null, null));
    await as(db, cliA, () => ins(custA, svcRemote, "remote", addrBogotaA, null));
  });
  it("exige dirección para modalidades físicas y que sea del propio cliente", async () => {
    await expect(as(db, cliA, () => ins(custA, svcPhysical, "pickup", null, eqA))).rejects.toThrow(
      /address_required/,
    );
    await expect(as(db, cliA, () => ins(custA, svcPhysical, "pickup", addrB, eqA))).rejects.toThrow(
      /address_not_owned/,
    );
    await expect(as(db, cliA, () => ins(custA, svcPhysical, "pickup", addrCaliA, eqB))).rejects.toThrow(
      /equipment_not_owned/,
    );
  });
  it("no permite una modalidad que el servicio no ofrece", async () => {
    await expect(as(db, cliA, () => ins(custA, svcRemote, "pickup", addrCaliA, null))).rejects.toThrow(
      /modality_not_allowed/,
    );
  });
  it("administración puede desactivar una ciudad y la validación lo respeta", async () => {
    await q(`update coverage_areas set is_active = false where dane_code = '76364'`);
    expect((await q<{ c: boolean }>(`select public.check_coverage('76364','pickup') c`))[0].c).toBe(false);
    expect((await q<{ c: boolean }>(`select public.check_coverage('76364','remote') c`))[0].c).toBe(true);
    await q(`update coverage_areas set is_active = true where dane_code = '76364'`);
  });
});

describe("tickets, máquina de estados y autorización", () => {
  let t1: string;
  const mkTicket = async (assign: string | null = techA) =>
    (
      await q<{ id: string }>(
        `insert into tickets (customer_id, equipment_id, service_id, modality, problem, assigned_to) values ($1,$2,$3,'pickup','Muy lento al encender',$4) returning id`,
        [custA, eqA, svcPhysical, assign],
      )
    )[0].id;
  const st = async (id: string) =>
    (await q<{ status: string }>(`select status from tickets where id = $1`, [id]))[0].status;
  const go = (user: string, id: string, to: string, reason: string | null = null) =>
    as(db, user, () => q(`select public.transition_ticket($1, $2, $3)`, [id, to, reason]));

  beforeAll(async () => {
    t1 = await mkTicket();
  });

  it("el cliente no puede crear tickets ni modificar su estado, técnico o datos de control", async () => {
    await expect(
      as(db, cliA, () =>
        q(`insert into tickets (customer_id, modality, problem) values ($1,'store','hola mundo')`, [custA]),
      ),
    ).rejects.toThrow(denied);
    await expect(
      as(db, cliA, () => q(`update tickets set status = 'delivered' where id = $1`, [t1])),
    ).rejects.toThrow(denied);
    await expect(
      as(db, cliA, () => q(`update tickets set assigned_to = $2 where id = $1`, [t1, cliA])),
    ).rejects.toThrow(denied);
    await expect(go(cliA, t1, "diagnosing")).rejects.toThrow(/forbidden/);
  });

  it("el técnico tampoco puede cambiar el estado por UPDATE directo ni reasignarse", async () => {
    await expect(
      as(db, techA, () => q(`update tickets set status = 'delivered' where id = $1`, [t1])),
    ).rejects.toThrow(denied);
    await expect(
      as(db, techA, () => q(`update tickets set assigned_to = $2 where id = $1`, [t1, techB])),
    ).rejects.toThrow(denied);
    await expect(as(db, techA, () => q(`select public.assign_ticket($1,$2)`, [t1, techB]))).rejects.toThrow(
      /forbidden/,
    );
  });

  it("visibilidad: cliente dueño, técnico asignado y admin; otros no", async () => {
    expect(await as(db, cliA, () => q(`select id from tickets`))).toHaveLength(1);
    expect(await as(db, cliB, () => q(`select id from tickets`))).toHaveLength(0);
    expect(await as(db, techA, () => q(`select id from tickets`))).toHaveLength(1);
    expect(await as(db, techB, () => q(`select id from tickets`))).toHaveLength(0);
    expect(await as(db, techB, () => q(`select id from customers where id = $1`, [custA]))).toHaveLength(0);
    expect(await as(db, techA, () => q(`select id from customers where id = $1`, [custA]))).toHaveLength(1);
    await expect(go(techB, t1, "diagnosing")).rejects.toThrow(/forbidden/);
  });

  it("registra el estado inicial en el historial", async () => {
    const h = await q(`select to_status from ticket_status_history where ticket_id = $1`, [t1]);
    expect(h).toEqual([{ to_status: "received" }]);
  });

  it("precondiciones: recepción y fotografías obligatorias antes de diagnosticar", async () => {
    await expect(go(techA, t1, "diagnosing")).rejects.toThrow(/reception_missing/);
    await as(db, techA, () =>
      q(`insert into receptions (ticket_id, reason) values ($1, 'Lentitud general')`, [t1]),
    );
    await expect(go(techA, t1, "diagnosing")).rejects.toThrow(/reception_photos_missing/);
    for (const [i, slot] of ["front", "back", "screen", "serial"].entries())
      await q(
        `insert into evidence (ticket_id, stage, slot, cloudinary_public_id) values ($1,'reception',$2,$3)`,
        [t1, slot, `tu/${t1}/${i}`],
      );
    await go(techA, t1, "diagnosing");
    expect(await st(t1)).toBe("diagnosing");
  });

  it("rechaza transiciones inválidas y exige motivo para cancelar (solo admin)", async () => {
    await expect(go(techA, t1, "ready")).rejects.toThrow(/invalid_transition/);
    await expect(go(techA, t1, "delivered")).rejects.toThrow(/invalid_transition/);
    await expect(go(techA, t1, "cancelled", "no quiero")).rejects.toThrow(/forbidden_transition/);
    await expect(go(admin, t1, "cancelled")).rejects.toThrow(/reason_required/);
  });

  it("no se puede esperar aprobación sin cotización enviada ni iniciar servicio sin aprobación", async () => {
    await expect(go(techA, t1, "awaiting_approval")).rejects.toThrow(/quote_not_sent/);
    await expect(go(techA, t1, "in_service")).rejects.toThrow(/quote_not_approved/);
  });

  it("flujo completo hasta entrega: cotización, checklist, entrega, garantías y mantenimiento", async () => {
    const [{ id: qid }] = await as(db, techA, () =>
      q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [
        t1,
        custA,
      ]),
    );
    // intentar fijar estado/total en el INSERT está denegado a nivel de columna
    await expect(
      as(db, techA, () =>
        q(`insert into quotes (ticket_id, customer_id, status, total) values ($1,$2,'approved',999999999)`, [
          t1,
          custA,
        ]),
      ),
    ).rejects.toThrow(denied);
    // el cliente de la cotización debe ser el del ticket y el estado/total NO se confían del emisor
    const [qq] = await q<{ status: string; total: string }>(
      `select status, total from quotes where id = $1`,
      [qid],
    );
    expect(qq.status).toBe("draft");
    expect(Number(qq.total)).toBe(0);
    await as(db, techA, () =>
      q(
        `insert into quote_items (quote_id, kind, service_id, description, qty) values ($1,'service',$2,'Mantenimiento preventivo',1)`,
        [qid, svcPhysical],
      ),
    );
    await as(db, techA, () =>
      q(
        `insert into quote_items (quote_id, position, kind, product_id, description, qty, warranty_days, warranty_kind) values ($1,2,'product',$2,'SSD 480 GB',1,365,'product')`,
        [qid, prodSsd],
      ),
    );
    const [tot] = await q<{ total: string; subtotal: string }>(
      `select total, subtotal from quotes where id = $1`,
      [qid],
    );
    expect(Number(tot.total)).toBe(70000 + 189000);
    // precio de catálogo: el técnico no puede alterarlo
    await expect(
      as(db, techA, () =>
        q(
          `insert into quote_items (quote_id, position, kind, service_id, description, qty, unit_price) values ($1,3,'service',$2,'Descuento camuflado',1,1)`,
          [qid, svcPhysical],
        ),
      ),
    ).rejects.toThrow(/price_override_forbidden/);
    // el cliente no ve borradores
    expect(await as(db, cliA, () => q(`select id from quotes`))).toHaveLength(0);
    // envío (lo hace el flujo servidor) → el cliente la ve pero no puede editarla
    await q(`update quotes set status = 'sent', sent_at = now() where id = $1`, [qid]);
    expect(await as(db, cliA, () => q(`select id from quotes`))).toHaveLength(1);
    await expect(as(db, cliA, () => q(`update quotes set total = 1 where id = $1`, [qid]))).rejects.toThrow(
      denied,
    );
    await expect(
      as(db, cliA, () => q(`update quotes set status = 'approved' where id = $1`, [qid])),
    ).rejects.toThrow(denied);
    await expect(
      as(db, techA, () =>
        q(
          `insert into quote_items (quote_id, position, kind, description, qty, unit_price) values ($1,9,'custom','Extra',1,5)`,
          [qid],
        ),
      ),
    ).rejects.toThrow(/quote_not_editable/);
    await go(techA, t1, "awaiting_approval");
    await q(`update quotes set status = 'approved', decided_at = now() where id = $1`, [qid]);
    await go(techA, t1, "in_service");
    await go(techA, t1, "testing");
    await expect(go(techA, t1, "ready")).rejects.toThrow(/checklist_missing/);
    const [{ id: run }] = await as(db, techA, () =>
      q<{ id: string }>(`insert into checklist_runs (ticket_id) values ($1) returning id`, [t1]),
    );
    await as(db, techA, () =>
      q(`insert into checklist_items (run_id, label) values ($1,'Encendido'), ($1,'Pantalla')`, [run]),
    );
    await expect(go(techA, t1, "ready")).rejects.toThrow(/checklist_incomplete/);
    await as(db, techA, () => q(`update checklist_items set state = 'pass' where run_id = $1`, [run]));
    await go(techA, t1, "ready");
    await expect(go(techA, t1, "delivered")).rejects.toThrow(/delivery_record_missing/);
    await as(db, techA, () =>
      q(`insert into deliveries (ticket_id, received_by_name) values ($1,'Cliente A')`, [t1]),
    );
    await go(techA, t1, "delivered");
    expect(await st(t1)).toBe("delivered");

    const w = await q<{ kind: string; days: number }>(
      `select kind, (end_date - start_date) days from warranties where ticket_id = $1 order by kind`,
      [t1],
    );
    expect(w).toEqual([expect.objectContaining({ kind: "product", days: 365 })]);
    expect(await as(db, cliA, () => q(`select id from warranties`))).not.toHaveLength(0);
    expect(
      await q(`select 1 from maintenance_plans where ticket_id = $1 and interval_months = 6`, [t1]),
    ).toHaveLength(1);
    expect(
      await q(`select 1 from crm_tasks where ticket_id = $1 and task_type = 'maintenance'`, [t1]),
    ).toHaveLength(1);
    expect(await as(db, cliA, () => q(`select id from notifications`))).not.toHaveLength(0);
    // estados finales: ya no se reabre
    await expect(go(admin, t1, "testing")).rejects.toThrow(/invalid_transition/);
  });

  it("el historial es inmutable incluso para el propietario de la base de datos", async () => {
    await expect(
      q(`update ticket_status_history set reason = 'x' where ticket_id = $1`, [t1]),
    ).rejects.toThrow(/immutable/);
    await expect(q(`delete from ticket_status_history where ticket_id = $1`, [t1])).rejects.toThrow(
      /immutable/,
    );
  });

  it("seguimiento público: token no adivinable, sin datos personales", async () => {
    const [{ tracking_token }] = await q<{ tracking_token: string }>(
      `select tracking_token from tickets where id = $1`,
      [t1],
    );
    expect(tracking_token).toMatch(/^[a-z2-9]{12}$/);
    const ok = await as(db, null, () =>
      q<{ r: Record<string, unknown> }>(`select public.track_ticket($1) r`, [tracking_token]),
    );
    expect(JSON.stringify(ok[0].r)).not.toMatch(/Cliente|gmail|phone/i);
    expect(ok[0].r.status).toBe("delivered");
    const bad = await as(db, null, () => q<{ r: unknown }>(`select public.track_ticket('aaaaaaaaaaaa') r`));
    expect(bad[0].r).toBeNull();
    const injection = await as(db, null, () =>
      q<{ r: unknown }>(`select public.track_ticket($1) r`, ["' or '1'='1"]),
    );
    expect(injection[0].r).toBeNull();
  });

  it("servicio que no requiere cotización puede iniciar sin ella; cancelación por admin con motivo", async () => {
    const id = (
      await q<{ id: string }>(
        `insert into tickets (customer_id, equipment_id, service_id, modality, problem, assigned_to) values ($1,$2,$3,'store','Optimizar equipo',$4) returning id`,
        [custA, eqA, svcNoQuote, techA],
      )
    )[0].id;
    await as(db, techA, () =>
      q(`insert into receptions (ticket_id, reason) values ($1,'Optimización')`, [id]),
    );
    for (let i = 0; i < 4; i++)
      await q(`insert into evidence (ticket_id, stage, cloudinary_public_id) values ($1,'reception',$2)`, [
        id,
        `x/${id}/${i}`,
      ]);
    await go(techA, id, "diagnosing");
    await go(techA, id, "in_service");
    await go(admin, id, "cancelled", "Cliente desistió");
    expect(await st(id)).toBe("cancelled");
    expect((await q<{ r: string }>(`select cancelled_reason r from tickets where id = $1`, [id]))[0].r).toBe(
      "Cliente desistió",
    );
  });

  it("solo el administrador asigna y debe ser personal activo", async () => {
    const id = await mkTicket(null);
    await as(db, admin, () => q(`select public.assign_ticket($1,$2)`, [id, techB]));
    await expect(as(db, admin, () => q(`select public.assign_ticket($1,$2)`, [id, cliA]))).rejects.toThrow(
      /assignee_not_staff/,
    );
    expect(await as(db, techB, () => q(`select id from tickets where id = $1`, [id]))).toHaveLength(1);
  });
});

describe("dinero: inventario y pagos", () => {
  it("el stock solo cambia mediante movimientos y nunca queda negativo", async () => {
    await q(`insert into inventory_movements (product_id, delta, reason) values ($1, 5, 'purchase')`, [
      prodSsd,
    ]);
    expect(
      (await q<{ s: number }>(`select stock_on_hand s from inventory where product_id = $1`, [prodSsd]))[0].s,
    ).toBe(5);
    await expect(
      q(`insert into inventory_movements (product_id, delta, reason) values ($1, -9, 'sale')`, [prodSsd]),
    ).rejects.toThrow(/insufficient_stock/);
    await expect(
      as(db, admin, () => q(`update inventory set stock_on_hand = 999 where product_id = $1`, [prodSsd])),
    ).rejects.toThrow(denied);
    await expect(
      as(db, cliA, () =>
        q(`insert into inventory_movements (product_id, delta, reason) values ($1, 100, 'adjustment')`, [
          prodSsd,
        ]),
      ),
    ).rejects.toThrow(denied);
  });

  it("un pago aprobado es definitivo y los eventos del proveedor son idempotentes", async () => {
    const [{ id }] = await q<{ id: string }>(
      `insert into orders (customer_id, subtotal, total) values ($1, 1000, 1000) returning id`,
      [custA],
    );
    const [{ id: pid }] = await q<{ id: string }>(
      `insert into payments (customer_id, order_id, provider, amount, external_id) values ($1,$2,'mercadopago',1000,'mp-1') returning id`,
      [custA, id],
    );
    await q(`update payments set status = 'approved', approved_at = now() where id = $1`, [pid]);
    await expect(q(`update payments set status = 'rejected' where id = $1`, [pid])).rejects.toThrow(
      /payment_final_state/,
    );
    await expect(q(`update payments set amount = 1 where id = $1`, [pid])).rejects.toThrow(
      /payment_fields_immutable/,
    );
    await q(
      `insert into payment_events (payment_id, provider, provider_event_id, payload, signature_valid) values ($1,'mercadopago','evt-1','{}',true)`,
      [pid],
    );
    await expect(
      q(
        `insert into payment_events (payment_id, provider, provider_event_id, payload, signature_valid) values ($1,'mercadopago','evt-1','{}',true)`,
        [pid],
      ),
    ).rejects.toThrow(/duplicate|unique/);
    await expect(
      q(`update payment_events set payload = '{"x":1}' where provider_event_id = 'evt-1'`),
    ).rejects.toThrow(/immutable/);
    // el cliente ve sus pagos, otro cliente no
    expect(await as(db, cliA, () => q(`select id from payments`))).toHaveLength(1);
    expect(await as(db, cliB, () => q(`select id from payments`))).toHaveLength(0);
    // pago manual aprobado requiere confirmación administrativa
    await expect(
      q(
        `insert into payments (customer_id, order_id, provider, amount, status, approved_at) values ($1,$2,'manual',500,'approved',now())`,
        [custA, id],
      ),
    ).rejects.toThrow(/check/i);
  });
});

describe("legal, documentos y firma", () => {
  let docLegal: string;
  it("las versiones publicadas son inmutables y calculan su hash en base de datos", async () => {
    docLegal = (
      await q<{ id: string }>(
        `insert into legal_documents (slug, version, title, content, status) values ('terms',1,'Términos','Contenido v1','published') returning id`,
      )
    )[0].id;
    const [d] = await q<{ content_sha256: string }>(
      `select content_sha256 from legal_documents where id = $1`,
      [docLegal],
    );
    expect(d.content_sha256).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      q(`update legal_documents set content = 'cambio retroactivo' where id = $1`, [docLegal]),
    ).rejects.toThrow(/immutable_legal_version/);
    await expect(q(`delete from legal_documents where id = $1`, [docLegal])).rejects.toThrow(
      /immutable_legal_version/,
    );
  });
  it("la aceptación registra la versión exacta y no se puede alterar", async () => {
    await as(db, cliA, () => q(`select public.accept_legal_document($1)`, [docLegal]));
    const rows = await as(db, cliA, () => q(`select legal_document_id from legal_acceptances`));
    expect(rows).toEqual([{ legal_document_id: docLegal }]);
    expect(await as(db, cliB, () => q(`select * from legal_acceptances`))).toHaveLength(0);
    await expect(
      as(db, cliA, () =>
        q(`insert into legal_acceptances (profile_id, legal_document_id) values ($1,$2)`, [cliA, docLegal]),
      ),
    ).rejects.toThrow(denied);
    await expect(q(`update legal_acceptances set accepted_at = now()`)).rejects.toThrow(/immutable/);
    await expect(
      as(db, cliA, () => q(`select public.accept_legal_document(gen_random_uuid())`)),
    ).rejects.toThrow(/document_not_published/);
  });
  it("una firma solo es válida con el hash del documento y deja el documento inmutable", async () => {
    const hash = "a".repeat(64);
    const [{ id }] = await q<{ id: string }>(
      `insert into documents (doc_type, title, customer_id, storage_path, sha256) values ('reception','Acta de recepción',$1,'docs/a.pdf',$2) returning id`,
      [custA, hash],
    );
    await expect(
      q(
        `insert into document_signatures (document_id, signer_profile_id, signer_name, consent_text, signature_ref, document_sha256) values ($1,$2,'Cliente A','Acepto el contenido del documento','sig/1.png',$3)`,
        [id, cliA, "b".repeat(64)],
      ),
    ).rejects.toThrow(/document_hash_mismatch/);
    await q(
      `insert into document_signatures (document_id, signer_profile_id, signer_name, consent_text, signature_ref, document_sha256) values ($1,$2,'Cliente A','Acepto el contenido del documento','sig/1.png',$3)`,
      [id, cliA, hash],
    );
    expect((await q<{ status: string }>(`select status from documents where id = $1`, [id]))[0].status).toBe(
      "signed",
    );
    await expect(q(`update documents set sha256 = $2 where id = $1`, [id, "c".repeat(64)])).rejects.toThrow(
      /immutable_document/,
    );
    await expect(q(`update documents set status = 'draft' where id = $1`, [id])).rejects.toThrow(
      /signed_document_final/,
    );
    await expect(q(`delete from document_signatures`)).rejects.toThrow(/immutable/);
    expect(await as(db, cliB, () => q(`select id from documents`))).toHaveLength(0);
    expect(await as(db, cliA, () => q(`select id from documents`))).toHaveLength(1);
    await expect(
      as(db, cliA, () =>
        q(
          `insert into document_signatures (document_id, signer_profile_id, signer_name, consent_text, signature_ref, document_sha256) values ($1,$2,'x','consentimiento falso 1','s',$3)`,
          [id, cliA, hash],
        ),
      ),
    ).rejects.toThrow(denied);
  });
});

describe("auditoría", () => {
  it("registra acciones críticas con actor y no se puede alterar (ni por el propietario)", async () => {
    const logs = await q<{ action: string }>(`select distinct action from audit_logs`);
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(
      expect.arrayContaining(["ticket.status_changed", "staff.provisioned", "ticket.assigned"]),
    );
    await expect(q(`update audit_logs set action = 'borrado'`)).rejects.toThrow(/immutable/);
    await expect(q(`delete from audit_logs`)).rejects.toThrow(/immutable/);
    await expect(q(`truncate audit_logs`)).rejects.toThrow(/immutable/);
    await expect(as(db, admin, () => q(`delete from audit_logs`))).rejects.toThrow(denied);
  });
  it("la cadena de hashes es verificable y detecta manipulación", async () => {
    expect((await q<{ ok: boolean }>(`select private.verify_audit_chain() ok`))[0].ok).toBe(true);
    await q(`alter table audit_logs disable trigger audit_logs_immutable`);
    await q(`update audit_logs set action = 'manipulado' where id = (select min(id) from audit_logs)`);
    expect((await q<{ ok: boolean }>(`select private.verify_audit_chain() ok`))[0].ok).toBe(false);
  });
  it("solo el administrador lee la auditoría", async () => {
    expect((await as(db, admin, () => q(`select id from audit_logs`))).length).toBeGreaterThan(0);
    expect(await as(db, techA, () => q(`select id from audit_logs`))).toHaveLength(0);
  });
});

describe("superficie de API", () => {
  it("ninguna tabla pública queda sin RLS", async () => {
    const rows = await q<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and not rowsecurity`,
    );
    expect(rows).toEqual([]);
  });
  it("anon y authenticated no pueden ejecutar funciones privadas ni administrativas", async () => {
    await expect(
      as(db, cliA, () => q(`select private.write_audit(null,null,'abc','x','1')`)),
    ).rejects.toThrow(denied);
    await expect(
      as(db, cliA, () =>
        q(`select private.apply_transition(gen_random_uuid(),'diagnosing',null,'admin',null,true)`),
      ),
    ).rejects.toThrow(denied);
    await expect(
      as(db, null, () => q(`select public.transition_ticket(gen_random_uuid(),'diagnosing')`)),
    ).rejects.toThrow(denied);
  });
  it("ninguna tabla otorga DELETE a authenticated salvo las explícitas", async () => {
    const rows = await q<{ table_name: string }>(
      `select distinct table_name from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'DELETE' order by 1`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      "legal_documents",
      "product_service_links",
      "push_subscriptions",
      "quote_items",
    ]);
  });
  it("authenticated no recibe TRUNCATE/REFERENCES/TRIGGER", async () => {
    const rows = await q(
      `select 1 from information_schema.role_table_grants where grantee in ('authenticated','anon') and table_schema = 'public' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')`,
    );
    expect(rows).toHaveLength(0);
  });
});

describe("regresiones de escritura por rol", () => {
  it("el técnico puede crear un ticket asignado a sí mismo (INSERT ... RETURNING) pero no asignarlo a otro", async () => {
    const rows = await as(db, techA, () =>
      q(
        `insert into tickets (customer_id, modality, problem, assigned_to) values ($1,'store','Cliente de mostrador',$2) returning id`,
        [custA, techA],
      ),
    );
    expect(rows).toHaveLength(1);
    await expect(
      as(db, techA, () =>
        q(
          `insert into tickets (customer_id, modality, problem, assigned_to) values ($1,'store','Suplantación',$2)`,
          [custA, techB],
        ),
      ),
    ).rejects.toThrow(denied);
  });
  it("el cliente no puede escribir notas, evidencias, documentos ni diagnósticos", async () => {
    const [t] = await q<{ id: string }>(`select id from tickets where customer_id = $1 limit 1`, [custA]);
    await expect(
      as(db, cliA, () => q(`insert into ticket_notes (ticket_id, body) values ($1,'hola')`, [t.id])),
    ).rejects.toThrow(denied);
    await expect(
      as(db, cliA, () =>
        q(`insert into evidence (ticket_id, stage, cloudinary_public_id) values ($1,'reception','x/y')`, [
          t.id,
        ]),
      ),
    ).rejects.toThrow(denied);
    await expect(
      as(db, techA, () =>
        q(`insert into evidence (ticket_id, stage, cloudinary_public_id) values ($1,'reception','x/z')`, [
          t.id,
        ]),
      ),
    ).rejects.toThrow(denied);
    await expect(
      as(db, cliA, () => q(`insert into diagnostics (ticket_id, summary) values ($1,'falso')`, [t.id])),
    ).rejects.toThrow(denied);
  });
  it("las notas internas no son visibles para el cliente", async () => {
    const [t] = await q<{ id: string }>(
      `select id from tickets where customer_id = $1 and assigned_to = $2 limit 1`,
      [custA, techA],
    );
    await as(db, techA, () =>
      q(
        `insert into ticket_notes (ticket_id, body, visibility) values ($1,'solo equipo','internal'), ($1,'para el cliente','customer')`,
        [t.id],
      ),
    );
    const visible = await as(db, cliA, () =>
      q<{ body: string }>(`select body from ticket_notes where ticket_id = $1`, [t.id]),
    );
    expect(visible.map((v) => v.body)).toEqual(["para el cliente"]);
  });
  it("una solicitud se puede cancelar solo por su dueño", async () => {
    const [r] = await q<{ id: string }>(
      `select id from service_requests where customer_id = $1 and status = 'pending' limit 1`,
      [custA],
    );
    if (r) {
      await expect(as(db, cliB, () => q(`select public.cancel_service_request($1)`, [r.id]))).rejects.toThrow(
        /request_not_cancellable/,
      );
      await as(db, cliA, () => q(`select public.cancel_service_request($1)`, [r.id]));
    }
  });
});

describe("revisión Zero Trust automática de funciones", () => {
  it("toda función SECURITY DEFINER fija search_path vacío", async () => {
    const rows = await q<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','private') and p.prosecdef
         and not coalesce(p.proconfig::text ilike '%search_path=""%' or p.proconfig::text ilike '%search_path=%', false)`,
    );
    expect(rows).toEqual([]);
  });
  it("toda RPC pública expuesta a authenticated/anon valida identidad o es de solo lectura pública explícita", async () => {
    const publicByDesign = new Set(["check_coverage", "track_ticket", "product_stock_flags"]);
    const rows = await q<{ proname: string; prosrc: string }>(
      `select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))`,
    );
    const unguarded = rows.filter(
      (r) => !publicByDesign.has(r.proname) && !/auth\.uid\(\)|private\.(is_|my_|can_|has_)/.test(r.prosrc),
    );
    expect(unguarded.map((r) => r.proname)).toEqual([]);
  });
  it("las funciones administrativas de personal son exclusivas de service_role", async () => {
    for (const fn of [
      "admin_provision_staff(uuid,uuid,app_role,text,text,text)",
      "admin_set_user_active(uuid,uuid,boolean)",
    ]) {
      const [r] = await q<{ a: boolean; b: boolean; c: boolean }>(
        `select has_function_privilege('authenticated','public.${fn}','execute') a, has_function_privilege('anon','public.${fn}','execute') b, has_function_privilege('service_role','public.${fn}','execute') c`,
      );
      expect(r).toEqual({ a: false, b: false, c: true });
    }
  });
  it("las políticas de escritura siempre incluyen WITH CHECK o son solo INSERT/DELETE", async () => {
    const rows = await q<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies where schemaname = 'public' and cmd in ('UPDATE','ALL') and with_check is null`,
    );
    expect(rows).toEqual([]);
  });
  it("ninguna política concede acceso incondicional (USING true) sobre datos privados", async () => {
    const rows = await q<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true')`,
    );
    expect(rows).toEqual([]);
  });
});
