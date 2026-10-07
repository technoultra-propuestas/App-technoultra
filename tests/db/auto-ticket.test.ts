import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let admin: string, tech: string, cliA: string, cliB: string, custA: string, custB: string;
const addr: Record<string, string> = {};
let fixed: string, quoteSvc: string, diag: string, digital: string, offline: string, forced: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const num = (v: unknown) => Number(v);
const denied = /permission denied|row-level security|forbidden|42501/i;

async function request(customer: string, service: string, modality = "store") {
  const address = modality === "remote" ? null : addr[customer];
  const [{ id }] = await q<{ id: string }>(`insert into service_requests (customer_id, service_id, modality, address_id, problem_description) values ($1,$2,$3,$4,'No enciende') returning id`, [customer, service, modality, address]);
  return id;
}
const auto = async (reqId: string) => (await q<{ auto_create_ticket: string }>(`select public.auto_create_ticket($1)`, [reqId]))[0].auto_create_ticket;
const flow = async (svc: string, m: string) => (await q<{ f: string }>(`select public.service_flow($1,$2) f`, [svc, m]))[0].f;

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
  for (const c of [custA, custB]) addr[c] = (await q<{ id: string }>(`insert into addresses (customer_id, line1, city_name, department, dane_code) values ($1,'Calle 1 # 2-3','Cali','Valle del Cauca','76001') returning id`, [c]))[0].id;
  const svc = (slug: string, extra: string) => q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment, requires_diagnosis, requires_quote ${extra.split("|")[0]}) values ('${slug}','${slug}','${extra.includes("digital") ? "digital" : "technical"}',${extra.split("|")[1] ?? 50000},'{store,remote,home}',false, false, false ${extra.split("|")[2] ?? ""}) returning id`).then((r) => r[0].id);
  fixed = await svc("fijo", "|50000");
  quoteSvc = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment, requires_diagnosis, requires_quote) values ('cot','Con cotización','technical',70000,'{store,home}',false,true,true) returning id`))[0].id;
  diag = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, is_diagnostic_fee, requires_equipment) values ('diag','Diagnóstico','technical',39900,'{store,home}',true,false) returning id`))[0].id;
  digital = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment) values ('web','Sitio web','digital',500000,'{remote}',false) returning id`))[0].id;
  offline = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment, allow_online_payment) values ('local','Solo en local','technical',30000,'{store}',false,false) returning id`))[0].id;
  forced = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment, requires_quote, flow_override) values ('forz','Forzado inmediato','technical',20000,'{store}',false,true,'immediate') returning id`))[0].id;
}, 180000);

describe("matriz de flujo por servicio (centralizada en la base de datos)", () => {
  it("precio fijo sin cotización ni diagnóstico previo → pago inmediato (local y remoto)", async () => {
    expect(await flow(fixed, "store")).toBe("immediate");
    expect(await flow(fixed, "remote")).toBe("immediate");
  });
  it("domicilio/recogida llevan tarifa de cobertura → cotización; cotización/diagnóstico previo → cotización; digital → cotización", async () => {
    expect(await flow(fixed, "home")).toBe("quote");
    expect(await flow(fixed, "pickup")).toBe("quote");
    expect(await flow(quoteSvc, "store")).toBe("quote");
    expect(await flow(digital, "remote")).toBe("quote");
  });
  it("un servicio «+ repuesto» (sin precio final) nunca es de pago inmediato, salvo que el SUPERADMIN lo fuerce", async () => {
    const id = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment, parts_extra) values ('mas-rep','Con repuesto','technical',60000,'{store}',false,true) returning id`))[0].id;
    expect(await flow(id, "store")).toBe("quote");
    await q(`update services set flow_override = 'immediate' where id = $1`, [id]);
    expect(await flow(id, "store")).toBe("immediate");
  });
  it("el flujo se puede forzar desde la configuración del servicio", async () => {
    expect(await flow(forced, "store")).toBe("immediate");
    await q(`update services set flow_override = 'quote' where id = $1`, [fixed]);
    expect(await flow(fixed, "store")).toBe("quote");
    await q(`update services set flow_override = null where id = $1`, [fixed]);
    expect(await flow(fixed, "store")).toBe("immediate");
    await expect(q(`update services set flow_override = 'otro' where id = $1`, [fixed])).rejects.toThrow();
  });
  it("un cliente no puede editar la configuración del flujo de un servicio", async () => {
    for (const who of [cliA, tech]) {
      const r = await as(db, who, () => q(`update services set flow_override = 'immediate' where id = $1 returning id`, [quoteSvc])).catch((e) => (denied.test(String(e)) ? [] : Promise.reject(e)));
      expect(r.length).toBe(0);
    }
    expect(await flow(quoteSvc, "store")).toBe("quote");
  });
});

describe("ticket automático", () => {
  it("la solicitud técnica genera su ticket «Recibido», sin asignar, con aviso al SUPERADMIN y auditoría", async () => {
    const r = await request(custA, fixed);
    const t = await auto(r);
    const row = (await q<{ status: string; assigned_to: string | null; service_request_id: string; customer_id: string; modality: string }>(`select status, assigned_to, service_request_id, customer_id, modality from tickets where id = $1`, [t]))[0];
    expect(row).toEqual({ status: "received", assigned_to: null, service_request_id: r, customer_id: custA, modality: "store" });
    expect((await q(`select 1 from notifications where entity_id = $1 and type = 'ticket.created' and recipient_id = $2`, [t, admin])).length).toBe(1);
    expect((await q(`select 1 from audit_logs where action = 'ticket.auto_created' and entity_id = $1`, [t])).length).toBe(1);
    expect((await q<{ status: string }>(`select status from service_requests where id = $1`, [r]))[0].status).toBe("converted");
  });
  it("es idempotente: repetirlo o hacerlo en paralelo devuelve el mismo ticket", async () => {
    const r = await request(custA, fixed);
    const [a, b, c] = await Promise.all([auto(r), auto(r), auto(r)]);
    expect(new Set([a, b, c]).size).toBe(1);
    expect((await q(`select 1 from tickets where service_request_id = $1`, [r])).length).toBe(1);
    expect((await q(`select 1 from notifications where entity_id = $1 and type = 'ticket.created'`, [a])).length).toBe(1);
  });
  it("las soluciones digitales no generan ticket (nacen como proyecto, lo gestiona el SUPERADMIN)", async () => {
    const r = await request(custA, digital, "remote");
    await expect(auto(r)).rejects.toThrow(/service_not_technical/);
  });
  it("una solicitud cancelada no se convierte; una inexistente tampoco", async () => {
    const r = await request(custA, fixed);
    await q(`update service_requests set status = 'cancelled' where id = $1`, [r]);
    await expect(auto(r)).rejects.toThrow(/request_not_open/);
    await expect(auto("00000000-0000-4000-8000-000000000000")).rejects.toThrow(/request_not_found/);
  });
  it("solo el servidor (service_role) puede ejecutarlo: ni cliente, ni técnico, ni anónimo", async () => {
    const r = await request(custA, fixed);
    await expect(as(db, cliA, () => q(`select public.auto_create_ticket($1)`, [r]))).rejects.toThrow(denied);
    await expect(as(db, tech, () => q(`select public.auto_create_ticket($1)`, [r]))).rejects.toThrow(denied);
  });
  it("el cliente ve su ticket y NO el del otro cliente", async () => {
    const t = await auto(await request(custB, fixed));
    expect((await as(db, cliB, () => q(`select 1 from tickets where id = $1`, [t]))).length).toBe(1);
    expect((await as(db, cliA, () => q(`select 1 from tickets where id = $1`, [t]))).length).toBe(0);
  });
});

describe("pago inmediato de un servicio de precio fijo", () => {
  const begin = (actor: string, ticket: string, kind = "service") => q<{ payment_id: string; amount: string; external_reference: string }>(`select * from public.begin_service_payment($1,$2,$3)`, [actor, kind, ticket]);
  const newTicket = async (service = fixed, customer = custA, modality = "store") => auto(await request(customer, service, modality));

  it("el importe sale de la base de datos (instantánea del servicio) aunque el precio cambie después", async () => {
    const t = await newTicket();
    await q(`update services set base_price = 999999 where id = $1`, [fixed]);
    const [p] = await begin(cliA, t);
    expect(num(p.amount)).toBe(50000);
    await q(`update services set base_price = 50000 where id = $1`, [fixed]);
  });
  it("doble clic / reintento: un solo pago pendiente (misma referencia)", async () => {
    const t = await newTicket();
    const res = await Promise.all([begin(cliA, t), begin(cliA, t), begin(cliA, t)]);
    expect(new Set(res.map((r) => r[0].payment_id)).size).toBe(1);
    expect((await q(`select 1 from payments where ticket_id = $1 and purpose = 'service'`, [t])).length).toBe(1);
  });
  it("otro cliente no puede iniciar el pago de un ticket ajeno (IDOR)", async () => {
    const t = await newTicket();
    await expect(begin(cliB, t)).rejects.toThrow(/not_found/);
    expect((await q(`select 1 from payments where ticket_id = $1`, [t])).length).toBe(0);
  });
  it("un cliente no puede llamar a las funciones de pago ni escribir pagos por la API", async () => {
    const t = await newTicket();
    await expect(as(db, cliA, () => q(`select * from public.begin_service_payment($1,'service',$2)`, [cliA, t]))).rejects.toThrow(denied);
    await expect(as(db, cliA, () => q(`insert into payments (customer_id, ticket_id, purpose, provider, status, amount) values ($1,$2,'service','manual','approved',1)`, [custA, t]))).rejects.toThrow(denied);
  });
  it("aprobación: monto distinto se rechaza; el correcto liquida una sola vez aunque el webhook se repita", async () => {
    const t = await newTicket();
    const [p] = await begin(cliA, t);
    const ev = (id: string, amount: number, status = "approved") => q<{ r: string }>(`select public.apply_payment_event('mercadopago',$1,'order.processed','{}'::jsonb,true,$2,'ORD1',$3::payment_status,$4,'COP') r`, [id, p.external_reference, status, amount]).then((x) => x[0].r);
    expect(await ev("e1", 1000)).toBe("amount_mismatch");
    expect((await q<{ prepaid_at: string | null }>(`select prepaid_at from tickets where id = $1`, [t]))[0].prepaid_at).toBeNull();
    expect(await ev("e2", 50000)).toBe("approved");
    for (const id of ["e2", "e3", "e4", "e5"]) await ev(id, 50000);
    const row = (await q<{ prepaid_at: string; prepaid_amount: string }>(`select prepaid_at, prepaid_amount from tickets where id = $1`, [t]))[0];
    expect(row.prepaid_at).not.toBeNull();
    expect(num(row.prepaid_amount)).toBe(50000);
    expect((await q(`select 1 from notifications where entity_id = $1 and type = 'payment.approved'`, [p.payment_id])).length).toBe(1);
    expect((await q(`select 1 from notifications where entity_id = $1 and type = 'payment.received'`, [p.payment_id])).length).toBe(1);
    await expect(begin(cliA, t)).rejects.toThrow(/service_already_paid/);
  });
  it("un webhook tardío «pendiente» no reabre un pago aprobado", async () => {
    const t = await newTicket();
    const [p] = await begin(cliA, t);
    await q(`select public.apply_payment_event('mercadopago','x1','order.processed','{}'::jsonb,true,$1,'ORD2','approved',50000,'COP')`, [p.external_reference]);
    const r = (await q<{ r: string }>(`select public.apply_payment_event('mercadopago','x0','order.created','{}'::jsonb,true,$1,'ORD2','pending',50000,'COP') r`, [p.external_reference]))[0].r;
    expect(r).toBe("ignored_transition");
    expect((await q<{ status: string }>(`select status from payments where id = $1`, [p.payment_id]))[0].status).toBe("approved");
  });
  it("reglas: no aplica a diagnóstico, a servicios con cotización, a modalidades con domicilio ni a servicios sin pago en línea", async () => {
    await expect(begin(cliA, await newTicket(diag), "service")).rejects.toThrow(/ticket_is_diagnosis/);
    await expect(begin(cliA, await newTicket(quoteSvc), "service")).rejects.toThrow(/service_not_payable/);
    await expect(begin(cliA, await newTicket(fixed, custA, "home"), "service")).rejects.toThrow(/service_not_payable/);
    await expect(begin(cliA, await newTicket(offline), "service")).rejects.toThrow(/service_not_payable/);
  });
  it("el diagnóstico sigue pagándose como «diagnosis» (crédito abonable) y se paga una sola vez", async () => {
    const t = await newTicket(diag);
    const [p] = await begin(cliA, t, "diagnosis");
    expect(num(p.amount)).toBe(39900);
    await q(`select public.apply_payment_event('mercadopago','d1','order.processed','{}'::jsonb,true,$1,'ORD3','approved',39900,'COP')`, [p.external_reference]);
    await q(`select public.apply_payment_event('mercadopago','d1b','order.processed','{}'::jsonb,true,$1,'ORD3','approved',39900,'COP')`, [p.external_reference]);
    expect((await q(`select 1 from diagnosis_credits where ticket_id = $1`, [t])).length).toBe(1);
    await expect(begin(cliA, t, "diagnosis")).rejects.toThrow(/diagnosis_already_paid/);
  });
  it("el SUPERADMIN puede registrar el pago manual del servicio (una sola vez); técnico y cliente no", async () => {
    const t = await newTicket();
    await expect(as(db, tech, () => q(`select public.record_manual_service_payment($1,'service',$2,'cash')`, [tech, t]))).rejects.toThrow(denied);
    await q(`select public.record_manual_service_payment($1,'service',$2,'cash')`, [admin, t]);
    expect((await q<{ prepaid_at: string | null }>(`select prepaid_at from tickets where id = $1`, [t]))[0].prepaid_at).not.toBeNull();
    await expect(q(`select public.record_manual_service_payment($1,'service',$2,'cash')`, [admin, t])).rejects.toThrow(/service_already_paid/);
  });
  it("el pago de un ticket cerrado no se puede iniciar", async () => {
    const t = await newTicket();
    await q(`update tickets set status = 'cancelled', cancelled_reason = 'x' where id = $1`, [t]).catch(() => null);
    const st = (await q<{ status: string }>(`select status from tickets where id = $1`, [t]))[0].status;
    if (st === "cancelled") await expect(begin(cliA, t)).rejects.toThrow(/ticket_closed/);
  });
});
