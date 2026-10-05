import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let svc150: string, admin: string, tech: string, cliA: string, cliB: string, custA: string, svc: string, diag: string, addr: string, reqHome: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;
const num = (v: unknown) => Number(v);

async function ticket(service: string, modality = "store", request: string | null = null): Promise<string> {
  const [{ id }] = await q<{ id: string }>(
    `insert into tickets (customer_id, service_id, modality, problem, assigned_to, service_request_id) values ($1,$2,$3,'Falla de prueba',$4,$5) returning id`,
    [custA, service, modality, tech, request],
  );
  await q(`insert into receptions (ticket_id, reason) values ($1,'Falla')`, [id]);
  for (let i = 0; i < 4; i++) await q(`insert into evidence (ticket_id, stage, cloudinary_public_id) values ($1,'reception',$2)`, [id, `e/${id}/${i}`]);
  await as(db, tech, () => q(`select public.transition_ticket($1,'diagnosing')`, [id]));
  return id;
}
const draft = async (t: string) => (await as(db, tech, () => q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [t, custA])))[0].id;
const item = (quote: string, service: string, position: number, price: number | null = null) =>
  as(db, tech, () => q(`insert into quote_items (quote_id, position, kind, service_id, description, qty, unit_price, warranty_days) values ($1,$2,'service',$3,'Ítem',1,$4,0)`, [quote, position, service, price]));
const quote = async (id: string) => (await q<Record<string, string | null>>(`select * from quotes where id = $1`, [id]))[0];

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, "admin@technoultra.com");
  await makeAdmin(db, admin);
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, admin, tech);
  cliA = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
  cliB = await createUser(db, "b@gmail.com", { full_name: "Cliente B" });
  custA = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliA]))[0].id;
  svc = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment) values ('reparacion','Reparación de prueba','technical',100000,'{store,home}',false) returning id`))[0].id;
  svc150 = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment) values ('rep150','Reparación mayor','technical',150000,'{store,home}',false) returning id`))[0].id;
  diag = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, is_diagnostic_fee, requires_equipment) values ('diag','Diagnóstico de prueba','technical',39900,'{store,home}',true,false) returning id`))[0].id;
  addr = (await q<{ id: string }>(`insert into addresses (customer_id, line1, city_name, department, dane_code) values ($1,'Calle 1 # 2-3','Cali','Valle del Cauca','76001') returning id`, [custA]))[0].id;
  reqHome = (await q<{ id: string }>(`insert into service_requests (customer_id, service_id, modality, address_id, problem_description) values ($1,$2,'home',$3,'Falla de prueba') returning id`, [custA, svc, addr]))[0].id;
}, 180000);

describe("IVA: el precio es el final", () => {
  it("por defecto no es responsable de IVA: no se agrega ni se desglosa", async () => {
    const quoteId = await draft(await ticket(svc));
    await item(quoteId, svc, 1);
    const r = await quote(quoteId);
    expect(num(r.total)).toBe(100000);
    expect(num(r.vat_included)).toBe(0);
    expect(r.tax_snapshot).toMatchObject({ responsible: false });
  });
  it("tax_rate nunca suma IVA encima del precio", async () => {
    const quoteId = await draft(await ticket(svc));
    await as(db, tech, () => q(`insert into quote_items (quote_id, kind, service_id, description, qty, tax_rate, warranty_days) values ($1,'service',$2,'Ítem',1,19,0)`, [quoteId, svc]));
    expect(num((await quote(quoteId)).total)).toBe(100000);
  });
  it("si es responsable, desglosa el IVA del total sin cambiar el precio", async () => {
    await q(`update app_settings set value = 'true' where key = 'tax.vat_responsible'`);
    const quoteId = await draft(await ticket(svc));
    await item(quoteId, svc, 1);
    const r = await quote(quoteId);
    expect(num(r.total)).toBe(100000);
    expect(num(r.vat_included)).toBe(15966.39);
    expect(r.tax_snapshot).toMatchObject({ responsible: true, rate: 19, included: true });
    await q(`update app_settings set value = 'false' where key = 'tax.vat_responsible'`);
  });
  it("valida los valores de configuración y solo el administrador los cambia", async () => {
    await expect(q(`update app_settings set value = '"si"' where key = 'tax.vat_responsible'`)).rejects.toThrow(/invalid_setting_value/);
    await expect(q(`update app_settings set value = '150' where key = 'tax.vat_rate'`)).rejects.toThrow(/invalid_setting_value/);
    await as(db, tech, () => q(`update app_settings set value = 'true' where key = 'tax.vat_responsible'`)); // RLS: 0 filas
    expect((await q<{ v: string }>(`select value::text v from app_settings where key = 'tax.vat_responsible'`))[0].v).toBe('false');
    expect((await as(db, cliA, () => q(`select value from app_settings where key = 'tax.vat_rate'`))).length).toBe(1); // pública
  });
});

describe("recargo por urgencia", () => {
  it("los niveles extra nacen inactivos y sin recargo", async () => {
    const rows = await q<{ code: string; is_active: boolean; percent: string }>(`select code, is_active, percent from urgency_levels order by sort_order`);
    expect(rows.map((r) => r.code)).toEqual(["normal", "prioritaria", "urgente", "emergencia"]);
    expect(rows.filter((r) => r.is_active).map((r) => r.code)).toEqual(["normal"]);
    expect(rows.every((r) => num(r.percent) === 0)).toBe(true);
  });
  it("calcula porcentaje, fijo y mínimo; el snapshot no cambia si luego se edita el nivel", async () => {
    await as(db, admin, () => q(`update urgency_levels set is_active = true, percent = 20, fixed_amount = 5000, min_amount = 30000 where code = 'urgente'`));
    const lvl = (await q<{ id: string }>(`select id from urgency_levels where code = 'urgente'`))[0].id;
    const quoteId = await draft(await ticket(svc));
    await item(quoteId, svc, 1); // 100000 → 20 % = 20000 + 5000 = 25000 → mínimo 30000
    await as(db, tech, () => q(`select public.set_quote_urgency($1,$2)`, [quoteId, lvl]));
    let r = await quote(quoteId);
    expect(num(r.urgency_amount)).toBe(30000);
    expect(num(r.total)).toBe(130000);
    await as(db, admin, () => q(`update urgency_levels set percent = 90 where code = 'urgente'`));
    await item(quoteId, svc, 2); // otra línea de 100000 → 200000 * 20 % + 5000 = 45000
    r = await quote(quoteId);
    expect(num(r.urgency_amount)).toBe(45000); // usa el 20 % congelado, no el 90 %
    expect(r.urgency_snapshot).toMatchObject({ code: "urgente", percent: 20 });
    await as(db, tech, () => q(`select public.set_quote_urgency($1,null)`, [quoteId]));
    expect(num((await quote(quoteId)).total)).toBe(200000);
  });
  it("rechaza niveles inactivos, fuera de día/horario o de modalidad, y a clientes", async () => {
    const quoteId = await draft(await ticket(svc));
    await item(quoteId, svc, 1);
    const inactive = (await q<{ id: string }>(`select id from urgency_levels where code = 'prioritaria'`))[0].id;
    await expect(as(db, tech, () => q(`select public.set_quote_urgency($1,$2)`, [quoteId, inactive]))).rejects.toThrow(/urgency_unavailable/);
    await expect(as(db, cliA, () => q(`select public.set_quote_urgency($1,$2)`, [quoteId, inactive]))).rejects.toThrow(denied);
    await as(db, admin, () => q(`update urgency_levels set is_active = true, days = array[(case when extract(isodow from now() at time zone 'America/Bogota') = 7 then 1 else extract(isodow from now() at time zone 'America/Bogota') + 1 end)::smallint] where code = 'prioritaria'`));
    await expect(as(db, tech, () => q(`select public.set_quote_urgency($1,$2)`, [quoteId, inactive]))).rejects.toThrow(/urgency_not_applicable/);
    await as(db, admin, () => q(`update urgency_levels set days = '{1,2,3,4,5,6,7}', modalities = '{remote}' where code = 'prioritaria'`));
    await expect(as(db, tech, () => q(`select public.set_quote_urgency($1,$2)`, [quoteId, inactive]))).rejects.toThrow(/urgency_not_applicable/);
  });
  it("solo aplica a los servicios configurados", async () => {
    const other = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment) values ('otro','Otro servicio','technical',60000,'{store}',false) returning id`))[0].id;
    const lvl = (await q<{ id: string }>(`select id from urgency_levels where code = 'urgente'`))[0].id;
    await as(db, admin, () => q(`update urgency_levels set percent = 20 where id = $1`, [lvl]));
    await as(db, admin, () => q(`insert into urgency_level_services (level_id, service_id) values ($1,$2)`, [lvl, other]));
    const quoteId = await draft(await ticket(svc));
    await item(quoteId, svc, 1);
    await item(quoteId, other, 2);
    await as(db, tech, () => q(`select public.set_quote_urgency($1,$2)`, [quoteId, lvl]));
    expect(num((await quote(quoteId)).urgency_amount)).toBe(30000); // 60000 * 20 % + 5000 = 17000 → mínimo 30000
    await as(db, admin, () => q(`delete from urgency_level_services where level_id = $1`, [lvl]));
  });
  it("el cliente no administra niveles", async () => {
    await as(db, cliA, () => q(`update urgency_levels set percent = 0`)); // RLS: 0 filas
    expect((await q<{ p: string }>(`select percent p from urgency_levels where code = 'urgente'`))[0].p).not.toBe('0.00');
    await expect(as(db, tech, () => q(`insert into urgency_levels (code, label) values ('nuevo','Nuevo')`))).rejects.toThrow(denied);
  });
});

describe("domicilio", () => {
  it("las tarifas iniciales salen de la cobertura: Cali $15.000, el resto $25.000", async () => {
    const rows = await q<{ dane_code: string; home_fee: string }>(`select dane_code, home_fee from coverage_areas order by dane_code`);
    for (const r of rows) expect(num(r.home_fee)).toBe(r.dane_code === "76001" ? 15000 : 25000);
  });
  it("se suma como concepto aparte y se congela; no aplica a modalidad tienda", async () => {
    const quoteId = await draft(await ticket(svc, "home", reqHome));
    await item(quoteId, svc, 1);
    await as(db, tech, () => q(`select public.set_quote_delivery($1,true)`, [quoteId]));
    let r = await quote(quoteId);
    expect(num(r.delivery_fee)).toBe(15000);
    expect(num(r.total)).toBe(115000);
    expect(r.delivery_snapshot).toMatchObject({ city: "Cali", fee: 15000 });
    await q(`update coverage_areas set home_fee = 99999 where dane_code = '76001'`);
    await item(quoteId, svc, 2);
    r = await quote(quoteId);
    expect(num(r.delivery_fee)).toBe(15000); // el cambio de tarifa no altera la cotización
    await as(db, tech, () => q(`select public.set_quote_delivery($1,false)`, [quoteId]));
    expect(num((await quote(quoteId)).total)).toBe(200000);
    await q(`update coverage_areas set home_fee = 15000 where dane_code = '76001'`);
    const store = await draft(await ticket(svc, "store"));
    await expect(as(db, tech, () => q(`select public.set_quote_delivery($1,true)`, [store]))).rejects.toThrow(/delivery_not_applicable/);
    await expect(as(db, cliA, () => q(`select public.set_quote_delivery($1,true)`, [store]))).rejects.toThrow(denied);
  });
});

describe("diagnóstico abonable", () => {
  it("el crédito se descuenta de la reparación, se consume al aprobar y no se usa dos veces", async () => {
    const t = await ticket(diag);
    await expect(as(db, tech, () => q(`select public.record_diagnosis_payment($1,$2,'cash')`, [tech, t]))).rejects.toThrow(denied);
    await expect(q(`select public.record_diagnosis_payment($1,$2,'cash')`, [cliA, t])).rejects.toThrow(/forbidden/);
    await q(`select public.record_diagnosis_payment($1,$2,'cash')`, [admin, t]);
    await expect(q(`select public.record_diagnosis_payment($1,$2,'cash')`, [admin, t])).rejects.toThrow(/diagnosis_already_paid/);
    const credit = (await q<{ amount: string; status: string }>(`select amount, status from diagnosis_credits where ticket_id = $1`, [t]))[0];
    expect(num(credit.amount)).toBe(39900);
    expect(credit.status).toBe("available");

    const quoteId = await draft(t);
    await item(quoteId, diag, 1); // el propio diagnóstico NO se abona a sí mismo
    expect(num((await quote(quoteId)).diagnosis_credit)).toBe(0);
    await item(quoteId, svc150, 2);
    const r = await quote(quoteId);
    expect(num(r.diagnosis_credit)).toBe(39900);
    expect(num(r.total)).toBe(39900 + 150000 - 39900);

    await as(db, tech, () => q(`select public.send_quote($1)`, [quoteId]));
    await as(db, cliA, () => q(`select public.decide_quote($1,'approve',null)`, [quoteId]));
    const after = (await q<{ status: string; applied_quote_id: string }>(`select status, applied_quote_id from diagnosis_credits where ticket_id = $1`, [t]))[0];
    expect(after).toEqual({ status: "applied", applied_quote_id: quoteId });
    await expect(q(`update diagnosis_credits set status = 'available' where ticket_id = $1`, [t])).rejects.toThrow(/diagnosis_credit_final/);
    await expect(q(`update diagnosis_credits set amount = 1 where ticket_id = $1`, [t])).rejects.toThrow(/diagnosis_credit_immutable/);
    expect((await q(`select 1 from payments where ticket_id = $1 and status = 'approved'`, [t])).length).toBe(1);
  });
  it("si el cliente rechaza, el diagnóstico queda cobrado y sin abono", async () => {
    const t = await ticket(diag);
    await q(`select public.record_diagnosis_payment($1,$2,'bank_transfer')`, [admin, t]);
    const quoteId = await draft(t);
    await item(quoteId, svc150, 1);
    await as(db, tech, () => q(`select public.send_quote($1)`, [quoteId]));
    await as(db, cliA, () => q(`select public.decide_quote($1,'reject','muy caro')`, [quoteId]));
    expect((await q<{ status: string }>(`select status from diagnosis_credits where ticket_id = $1`, [t]))[0].status).toBe("available");
    expect((await q(`select 1 from payments where ticket_id = $1 and status = 'approved'`, [t])).length).toBe(1);
  });
  it("un cliente solo ve sus créditos", async () => {
    expect((await as(db, cliA, () => q(`select 1 from diagnosis_credits`))).length).toBeGreaterThan(0);
    expect((await as(db, cliB, () => q(`select 1 from diagnosis_credits`))).length).toBe(0);
    await expect(as(db, cliA, () => q(`update diagnosis_credits set status = 'void'`))).rejects.toThrow(denied);
  });
});

describe("snapshots de órdenes y pagos", () => {
  it("el pago del diagnóstico guarda las condiciones fiscales del momento", async () => {
    const p = (await q<{ pricing_snapshot: { tax: { responsible: boolean } } }>(`select pricing_snapshot from payments order by created_at limit 1`))[0];
    expect(p.pricing_snapshot.tax.responsible).toBe(false);
  });
});
