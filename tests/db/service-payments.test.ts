import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let owner: string, tech: string, cliA: string, cliB: string, custA: string, svc: string, diag: string, ssd: string, instSvc: string, addr: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;
const num = (v: unknown) => Number(v);

const begin = (actor: string, kind: string, ref: string) => q<{ payment_id: string; amount: string; title: string; external_reference: string }>(`select * from public.begin_service_payment($1,$2,$3)`, [actor, kind, ref]);
let evSeq = 0;
const event = (ref: string, status: string, amount: number, opts: { sig?: boolean; id?: string; cur?: string } = {}) =>
  q<{ r: string }>(`select public.apply_payment_event('mercadopago', $1, 'payment', '{}'::jsonb, $2, $3, $7, $4::payment_status, $5, $6) r`, [opts.id ?? `evt-${++evSeq}`, opts.sig ?? true, ref, status, amount, opts.cur ?? "COP", `mp-${ref}`]).then((r) => r[0].r);

async function ticket(service: string): Promise<string> {
  const [{ id }] = await q<{ id: string }>(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','Falla de prueba',$3) returning id`, [custA, service, tech]);
  await q(`insert into receptions (ticket_id, reason) values ($1,'Falla')`, [id]);
  for (let i = 0; i < 4; i++) await q(`insert into evidence (ticket_id, stage, cloudinary_public_id) values ($1,'reception',$2)`, [id, `e/${id}/${i}`]);
  await as(db, tech, () => q(`select public.transition_ticket($1,'diagnosing')`, [id]));
  return id;
}
/** Cotización aprobada por el cliente con una línea del servicio (precio de catálogo). */
async function approvedQuote(t: string): Promise<string> {
  const [{ id }] = await as(db, tech, () => q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [t, custA]));
  await as(db, tech, () => q(`insert into quote_items (quote_id, kind, service_id, description, qty, warranty_days) values ($1,'service',$2,'Reparación',1,0)`, [id, svc]));
  await as(db, tech, () => q(`select public.send_quote($1)`, [id]));
  await as(db, cliA, () => q(`select public.decide_quote($1,'approve',null)`, [id]));
  return id;
}
const orderWith = async (items: unknown, method = "pickup_store") =>
  (await as(db, cliA, () => q<{ id: string }>(`select public.create_order($1::jsonb, $2, $3, null) id`, [JSON.stringify(items), method, addr])))[0].id;

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@technoultra.com");
  await makeAdmin(db, owner);
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, owner, tech);
  cliA = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
  cliB = await createUser(db, "b@gmail.com", { full_name: "Cliente B" });
  custA = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliA]))[0].id;
  svc = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment) values ('rep','Reparación de prueba','technical',150000,'{store,home}',false) returning id`))[0].id;
  diag = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, is_diagnostic_fee, requires_equipment) values ('dg','Diagnóstico de prueba','technical',39900,'{store,home}',true,false) returning id`))[0].id;
  ssd = (await q<{ id: string }>(`insert into products (sku, slug, name, price) values ('SSD','ssd','SSD 480',189000) returning id`))[0].id;
  instSvc = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities) values ('inst','Instalación SSD','technical',40000,'{home}') returning id`))[0].id;
  await q(`insert into product_service_links (product_id, service_id) values ($1,$2)`, [ssd, instSvc]);
  await q(`insert into inventory_movements (product_id, delta, reason) values ($1,20,'purchase')`, [ssd]);
  addr = (await q<{ id: string }>(`insert into addresses (customer_id, line1, city_name, department, dane_code) values ($1,'Cra 66 #10-25','Cali','Valle','76001') returning id`, [custA]))[0].id;
}, 180000);

describe("pago del diagnóstico", () => {
  it("el importe sale de la base de datos y el pago pendiente se reutiliza (idempotente)", async () => {
    const t = await ticket(diag);
    const [a] = await begin(cliA, "diagnosis", t);
    expect(num(a.amount)).toBe(39900);
    expect(a.external_reference).toBe(`pay-${a.payment_id}`);
    const [b] = await begin(cliA, "diagnosis", t);
    expect(b.payment_id).toBe(a.payment_id);
    await q(`update services set base_price = 99999 where id = $1`, [diag]); // el cambio de catálogo no altera el cobro (snapshot del ticket)
    expect(num((await begin(cliA, "diagnosis", t))[0].amount)).toBe(39900);
    await q(`update services set base_price = 39900 where id = $1`, [diag]);
  });
  it("solo su dueño lo paga; no aplica a tickets que no son de diagnóstico ni a tickets cerrados", async () => {
    const t = await ticket(diag);
    await expect(begin(cliB, "diagnosis", t)).rejects.toThrow(/not_found/);
    await expect(begin(cliA, "diagnosis", await ticket(svc))).rejects.toThrow(/ticket_not_diagnosis/);
    await expect(begin(cliA, "diagnosis", "00000000-0000-4000-8000-0000000000aa")).rejects.toThrow(/ticket_not_found/);
    await expect(begin(cliA, "cualquiera", t)).rejects.toThrow(/invalid_kind/);
  });
  it("el webhook aprobado crea UN solo crédito, y los reintentos o duplicados no lo repiten", async () => {
    const t = await ticket(diag);
    const [p] = await begin(cliA, "diagnosis", t);
    expect(await event(p.external_reference, "approved", 39900, { id: "same" })).toBe("approved");
    expect(await event(p.external_reference, "approved", 39900, { id: "same" })).toBe("duplicate");
    expect(await event(p.external_reference, "approved", 39900)).toBe("noop"); // otro evento con el mismo estado
    expect((await q(`select 1 from diagnosis_credits where ticket_id = $1`, [t])).length).toBe(1);
    expect(Number((await q<{ n: string }>(`select count(*) n from payments where ticket_id = $1 and status = 'approved'`, [t]))[0].n)).toBe(1);
    await expect(begin(cliA, "diagnosis", t)).rejects.toThrow(/diagnosis_already_paid/);
  });
  it("importe, moneda o firma inválidos no aprueban nada", async () => {
    const t = await ticket(diag);
    const [p] = await begin(cliA, "diagnosis", t);
    expect(await event(p.external_reference, "approved", 1)).toBe("amount_mismatch");
    expect(await event(p.external_reference, "approved", 39900, { cur: "USD" })).toBe("amount_mismatch");
    expect(await event(p.external_reference, "approved", 39900, { sig: false })).toBe("invalid_signature");
    expect(await event("pay-no-existe", "approved", 39900)).toBe("unknown_payment");
    expect((await q(`select 1 from diagnosis_credits where ticket_id = $1`, [t])).length).toBe(0);
    expect((await q<{ s: string }>(`select status s from payments where id = $1`, [p.payment_id]))[0].s).toBe("pending");
  });
  it("el pago manual solo lo registra el SUPERADMIN y queda auditado; no se cobra dos veces", async () => {
    const t = await ticket(diag);
    for (const who of [tech, cliA]) await expect(q(`select public.record_manual_service_payment($1,'diagnosis',$2,'cash')`, [who, t])).rejects.toThrow(/forbidden/);
    await expect(as(db, cliA, () => q(`select public.record_manual_service_payment($1,'diagnosis',$2,'cash')`, [cliA, t]))).rejects.toThrow(denied); // ni desde la API
    await q(`select public.begin_service_payment($1,'diagnosis',$2)`, [cliA, t]); // pago en línea pendiente
    await q(`select public.record_manual_service_payment($1,'diagnosis',$2,'bank_transfer')`, [owner, t]);
    expect(Number((await q<{ n: string }>(`select count(*) n from payments where ticket_id = $1 and status = 'pending'`, [t]))[0].n)).toBe(0); // el pendiente se anuló
    expect((await q(`select 1 from diagnosis_credits where ticket_id = $1`, [t])).length).toBe(1);
    await expect(q(`select public.record_manual_service_payment($1,'diagnosis',$2,'cash')`, [owner, t])).rejects.toThrow(/diagnosis_already_paid/);
    await expect(q(`select public.record_manual_service_payment($1,'diagnosis',$2,'bitcoin')`, [owner, await ticket(diag)])).rejects.toThrow(/invalid_method/);
    expect((await q(`select 1 from audit_logs where action = 'payment.manual_confirmed' and metadata ->> 'purpose' = 'diagnosis'`)).length).toBeGreaterThan(0);
  });
  it("no puede haber dos pagos activos del mismo diagnóstico ni de la misma cotización", async () => {
    const t = await ticket(diag);
    await q(`insert into payments (customer_id, ticket_id, purpose, provider, status, amount) values ($1,$2,'diagnosis','mercadopago','pending',39900)`, [custA, t]);
    await expect(q(`insert into payments (customer_id, ticket_id, purpose, provider, status, amount) values ($1,$2,'diagnosis','mercadopago','pending',39900)`, [custA, t])).rejects.toThrow(/payments_one_active_diagnosis/);
  });
});

describe("pago de la cotización aprobada", () => {
  it("solo se paga una cotización APROBADA, por su dueño, con el total congelado de la base de datos", async () => {
    const t = await ticket(svc);
    const [{ id: draft }] = await as(db, tech, () => q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [t, custA]));
    await as(db, tech, () => q(`insert into quote_items (quote_id, kind, service_id, description, qty, warranty_days) values ($1,'service',$2,'Reparación',1,0)`, [draft, svc]));
    await expect(begin(cliA, "quote", draft)).rejects.toThrow(/quote_not_payable/); // borrador
    await as(db, tech, () => q(`select public.send_quote($1)`, [draft]));
    await expect(begin(cliA, "quote", draft)).rejects.toThrow(/quote_not_payable/); // enviada, no aprobada
    await as(db, cliA, () => q(`select public.decide_quote($1,'approve',null)`, [draft]));
    await expect(begin(cliB, "quote", draft)).rejects.toThrow(/not_found/);
    const [p] = await begin(cliA, "quote", draft);
    expect(num(p.amount)).toBe(150000);
    expect((await begin(cliA, "quote", draft))[0].payment_id).toBe(p.payment_id);
    await q(`update services set base_price = 1 where id = $1`, [svc]); // un cambio posterior del catálogo no altera lo aprobado
    await q(`update services set base_price = 150000 where id = $1`, [svc]);
    expect(await event(p.external_reference, "approved", 150000)).toBe("approved");
    expect((await q<{ p: string | null }>(`select paid_at p from quotes where id = $1`, [draft]))[0].p).not.toBeNull();
    await expect(begin(cliA, "quote", draft)).rejects.toThrow(/quote_already_paid/);
    expect(await event(p.external_reference, "approved", 150000)).toBe("noop");
  });
  it("con el diagnóstico ya pagado, el cobro de la cotización descuenta el abono (monto desde BD)", async () => {
    const t = await ticket(diag);
    await q(`select public.record_manual_service_payment($1,'diagnosis',$2,'cash')`, [owner, t]);
    const quote = await approvedQuote(t);
    const [row] = await q<{ total: string; diagnosis_credit: string }>(`select total, diagnosis_credit from quotes where id = $1`, [quote]);
    expect(num(row.diagnosis_credit)).toBe(39900);
    const [p] = await begin(cliA, "quote", quote);
    expect(num(p.amount)).toBe(num(row.total));
    expect(num(p.amount)).toBe(150000 - 39900);
  });
  it("el pago manual de la cotización lo hace solo el SUPERADMIN", async () => {
    const quote = await approvedQuote(await ticket(svc));
    await expect(q(`select public.record_manual_service_payment($1,'quote',$2,'cash')`, [tech, quote])).rejects.toThrow(/forbidden/);
    await q(`select public.record_manual_service_payment($1,'quote',$2,'cash')`, [owner, quote]);
    expect((await q<{ p: string | null }>(`select paid_at p from quotes where id = $1`, [quote]))[0].p).not.toBeNull();
    await expect(q(`select public.record_manual_service_payment($1,'quote',$2,'cash')`, [owner, quote])).rejects.toThrow(/quote_already_paid/);
  });
  it("el cliente no puede escribir pagos, ni cambiar importes, ni llamar a las funciones de cobro", async () => {
    await expect(as(db, cliA, () => q(`insert into payments (customer_id, quote_id, purpose, provider, status, amount, approved_at) values ($1,gen_random_uuid(),'quote','mercadopago','approved',1,now())`, [custA]))).rejects.toThrow(denied);
    await expect(as(db, cliA, () => q(`update payments set amount = 1`))).rejects.toThrow(denied);
    for (const sql of [`select public.begin_service_payment('${cliA}','quote',gen_random_uuid())`, `select public.expire_pending_service_payments()`, `select private.settle_payment(gen_random_uuid())`]) {
      await expect(as(db, cliA, () => q(sql))).rejects.toThrow(denied);
    }
  });
});

describe("ticket automático de instalación (pedido pagado)", () => {
  const tickets = (orderId: string) => q<{ id: string; modality: string; address_id: string; order_item_id: string; service_id: string; problem: string }>(`select id, modality, address_id, order_item_id, service_id, problem from tickets where order_id = $1`, [orderId]);
  it("el pago aprobado crea un ticket de instalación enlazado al pedido, la línea, el cliente y la dirección; y es idempotente", async () => {
    const o = await orderWith([{ product_id: ssd, qty: 1, install: true }]);
    expect(await tickets(o)).toHaveLength(0); // sin pago no hay ticket
    const [p] = await q<{ payment_id: string; external_reference: string; amount: string }>(`select * from public.begin_payment($1,$2)`, [o, cliA]);
    expect(await event(p.external_reference, "approved", num(p.amount))).toBe("approved");
    const t = await tickets(o);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ modality: "home", address_id: addr, service_id: instSvc });
    expect(t[0].problem).toContain("SSD 480");
    expect((await q<{ c: string }>(`select customer_id c from tickets where id = $1`, [t[0].id]))[0].c).toBe(custA);
    // reprocesar (webhook duplicado, noop, o liquidar de nuevo) NO duplica
    expect(await event(p.external_reference, "approved", num(p.amount))).toBe("noop");
    await q(`select private.settle_payment($1)`, [p.payment_id]);
    await q(`select private.create_installation_tickets($1)`, [o]);
    expect(await tickets(o)).toHaveLength(1);
    expect((await q(`select 1 from audit_logs where action = 'ticket.created_from_order' and entity_id = $1`, [t[0].id])).length).toBe(1);
    expect((await q(`select 1 from notifications where type = 'ticket.created' and entity_id = $1`, [t[0].id])).length).toBe(1);
  });
  it("un pago rechazado o con monto distinto NO crea ticket; el pago manual del pedido sí (una vez)", async () => {
    const o1 = await orderWith([{ product_id: ssd, qty: 1, install: true }]);
    const [p1] = await q<{ external_reference: string; amount: string }>(`select * from public.begin_payment($1,$2)`, [o1, cliA]);
    expect(await event(p1.external_reference, "rejected", num(p1.amount))).toBe("rejected");
    expect(await event(p1.external_reference, "approved", 1)).toBe("amount_mismatch");
    expect(await tickets(o1)).toHaveLength(0);
    const o2 = await orderWith([{ product_id: ssd, qty: 1, install: true }]);
    await q(`select public.record_manual_payment($1,$2,'cash')`, [owner, o2]);
    expect(await tickets(o2)).toHaveLength(1);
    await expect(q(`select public.record_manual_payment($1,$2,'cash')`, [owner, o2])).rejects.toThrow(/order_not_payable/);
    expect(await tickets(o2)).toHaveLength(1);
  });
  it("un pedido sin instalación no genera tickets", async () => {
    const o = await orderWith([{ product_id: ssd, qty: 1 }]);
    await q(`select public.record_manual_payment($1,$2,'cash')`, [owner, o]);
    expect(await tickets(o)).toHaveLength(0);
  });
  it("la cotización de ese ticket puede cobrar domicilio con la dirección del pedido", async () => {
    const o = await orderWith([{ product_id: ssd, qty: 1, install: true }]);
    await q(`select public.record_manual_payment($1,$2,'cash')`, [owner, o]);
    const [t] = await tickets(o);
    await q(`update tickets set assigned_to = $1 where id = $2`, [tech, t.id]);
    const [{ id: quote }] = await as(db, tech, () => q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [t.id, custA]));
    await as(db, tech, () => q(`insert into quote_items (quote_id, kind, service_id, description, qty, warranty_days) values ($1,'service',$2,'Instalación',1,0)`, [quote, instSvc]));
    await as(db, tech, () => q(`select public.set_quote_delivery($1,true)`, [quote]));
    expect((await q<{ f: string }>(`select delivery_fee f from quotes where id = $1`, [quote]))[0].f).toBe("15000.00");
  });
});
