import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, type Db } from "./harness";

let db: Db;
let admin: string, cliA: string, cliB: string, custA: string, custB: string, ssd: string, mouse: string, instSvc: string, addrCali: string, addrBogota: string, addrB: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;
const stock = async (p: string) => (await q<{ s: number }>(`select stock_on_hand s from inventory where product_id = $1`, [p]))[0].s;
const order = (user: string, items: unknown, method = "pickup_store", addr: string | null = null) =>
  as(db, user, () => q<{ id: string }>(`select public.create_order($1::jsonb, $2, $3, null) id`, [JSON.stringify(items), method, addr]));
const ev = (id: string, ref: string, status: string, amount: number, opts: { sig?: boolean; cur?: string } = {}) =>
  q<{ r: string }>(`select public.apply_payment_event('mercadopago', $1, 'payment', '{}'::jsonb, $2, $3, 'mp-1', $4::payment_status, $5, $6) r`, [id, opts.sig ?? true, ref, status, amount, opts.cur ?? "COP"]);

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, "admin@technoultra.com");
  await makeAdmin(db, admin);
  cliA = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
  cliB = await createUser(db, "b@gmail.com", { full_name: "Cliente B" });
  custA = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliA]))[0].id;
  custB = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliB]))[0].id;
  ssd = (await q<{ id: string }>(`insert into products (sku, slug, name, price, warranty_days) values ('SSD','ssd','SSD 480',189000,365) returning id`))[0].id;
  mouse = (await q<{ id: string }>(`insert into products (sku, slug, name, price) values ('MOU','mouse','Mouse',45000) returning id`))[0].id;
  instSvc = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities) values ('ssd-inst','Instalación SSD','technical',40000,'{home}') returning id`))[0].id;
  await q(`insert into product_service_links (product_id, service_id) values ($1,$2)`, [ssd, instSvc]);
  await q(`insert into inventory_movements (product_id, delta, reason) values ($1,5,'purchase'), ($2,2,'purchase')`, [ssd, mouse]);
  await q(`update coverage_areas set home_fee = 8000 where dane_code = '76001'`);
  addrCali = (await q<{ id: string }>(`insert into addresses (customer_id, line1, city_name, department, dane_code) values ($1,'Cra 66 #10-25','Cali','Valle','76001') returning id`, [custA]))[0].id;
  addrBogota = (await q<{ id: string }>(`insert into addresses (customer_id, line1, city_name, department, dane_code) values ($1,'Calle 80 #1-2','Bogotá','Bogotá','11001') returning id`, [custA]))[0].id;
  addrB = (await q<{ id: string }>(`insert into addresses (customer_id, line1, city_name, department, dane_code) values ($1,'Calle 5 #38-14','Cali','Valle','76001') returning id`, [custB]))[0].id;
}, 180000);

describe("pedidos", () => {
  it("calcula precios y envío en base de datos y reserva el stock", async () => {
    const [{ id }] = await order(cliA, [{ product_id: ssd, qty: 2 }, { product_id: mouse, qty: 1 }], "delivery", addrCali);
    const [o] = await q<{ subtotal: string; shipping_fee: string; total: string }>(`select subtotal, shipping_fee, total from orders where id = $1`, [id]);
    expect([Number(o.subtotal), Number(o.shipping_fee), Number(o.total)]).toEqual([189000 * 2 + 45000, 8000, 189000 * 2 + 45000 + 8000]);
    expect(await stock(ssd)).toBe(3);
    expect(await stock(mouse)).toBe(1);
    await as(db, cliA, () => q(`select public.cancel_order($1)`, [id]));
    expect(await stock(ssd)).toBe(5);
  });
  it("el cliente no puede enviar precios, totales ni estados: la función no los acepta y la tabla no es escribible", async () => {
    await expect(as(db, cliA, () => q(`insert into orders (customer_id, subtotal, total) values ($1, 1, 1)`, [custA]))).rejects.toThrow(denied);
    await expect(as(db, cliA, () => q(`update orders set total = 1 where customer_id = $1`, [custA]))).rejects.toThrow(denied);
    await expect(as(db, cliA, () => q(`insert into order_items (order_id, description, qty, unit_price, product_id) values (gen_random_uuid(),'x',1,1,$1)`, [ssd]))).rejects.toThrow(denied);
  });
  it("valida stock, cantidades, productos y direcciones ajenas", async () => {
    await expect(order(cliA, [{ product_id: mouse, qty: 9 }])).rejects.toThrow(/insufficient_stock/);
    await expect(order(cliA, [{ product_id: mouse, qty: 0 }])).rejects.toThrow(/invalid_qty/);
    await expect(order(cliA, [{ product_id: "00000000-0000-4000-8000-00000000dead", qty: 1 }])).rejects.toThrow(/product_unavailable/);
    await expect(order(cliA, [])).rejects.toThrow(/invalid_items/);
    await expect(order(cliA, [{ product_id: mouse, qty: 1 }], "delivery", addrB)).rejects.toThrow(/address_not_owned/);
    await expect(order(cliA, [{ product_id: mouse, qty: 1 }], "delivery", null)).rejects.toThrow(/address_required/);
    expect(await stock(mouse)).toBe(2); // las transacciones fallidas no dejan reservas
  });
  it("la entrega a domicilio y la instalación exigen cobertura; recoger en tienda no", async () => {
    await expect(order(cliA, [{ product_id: mouse, qty: 1 }], "delivery", addrBogota)).rejects.toThrow(/out_of_coverage/);
    await expect(order(cliA, [{ product_id: ssd, qty: 1, install: true }], "pickup_store", addrBogota)).rejects.toThrow(/out_of_coverage/);
    const [{ id }] = await order(cliA, [{ product_id: ssd, qty: 1, install: true }], "pickup_store", addrCali);
    const [o] = await q<{ total: string; needs_installation: boolean }>(`select total, needs_installation from orders where id = $1`, [id]);
    expect(Number(o.total)).toBe(189000 + 40000);
    expect(o.needs_installation).toBe(true);
    await as(db, cliA, () => q(`select public.cancel_order($1)`, [id]));
  });
  it("un pedido ajeno no se ve ni se cancela", async () => {
    const [{ id }] = await order(cliA, [{ product_id: mouse, qty: 1 }]);
    expect(await as(db, cliB, () => q(`select id from orders where id = $1`, [id]))).toHaveLength(0);
    await expect(as(db, cliB, () => q(`select public.cancel_order($1)`, [id]))).rejects.toThrow(/order_not_found/);
    await as(db, cliA, () => q(`select public.cancel_order($1)`, [id]));
  });
  it("la disponibilidad pública no expone cantidades", async () => {
    const rows = await as(db, null, () => q<Record<string, unknown>>(`select * from public.product_stock_flags()`));
    expect(Object.keys(rows[0]).sort()).toEqual(["in_stock", "low_stock", "product_id"]);
    await expect(as(db, null, () => q(`select * from inventory`))).rejects.toThrow(denied);
  });
});

describe("pagos (confirmación solo desde el servidor)", () => {
  let orderId: string, payId: string, ref: string;
  beforeAll(async () => {
    [{ id: orderId }] = await order(cliA, [{ product_id: ssd, qty: 1 }], "pickup_store");
  });

  it("solo el servidor prepara pagos y solo para el dueño del pedido", async () => {
    await expect(as(db, cliA, () => q(`select * from public.begin_payment($1,$2)`, [orderId, cliA]))).rejects.toThrow(denied);
    await expect(q(`select * from public.begin_payment($1,$2)`, [orderId, cliB])).rejects.toThrow(/order_not_found/);
    const [p] = await q<{ payment_id: string; amount: string; external_reference: string }>(`select * from public.begin_payment($1,$2)`, [orderId, cliA]);
    payId = p.payment_id;
    ref = p.external_reference;
    expect(Number(p.amount)).toBe(189000); // el monto sale del pedido, no del navegador
    const [again] = await q<{ payment_id: string }>(`select * from public.begin_payment($1,$2)`, [orderId, cliA]);
    expect(again.payment_id).toBe(payId); // idempotente: reutiliza el pago pendiente
  });
  it("el navegador no puede aprobar pagos ni eventos", async () => {
    await expect(as(db, cliA, () => q(`update payments set status = 'approved', approved_at = now() where id = $1`, [payId]))).rejects.toThrow(denied);
    await expect(as(db, cliA, () => q(`select public.apply_payment_event('mercadopago','e0','payment','{}',true,$1,'1','approved',189000,'COP')`, [ref]))).rejects.toThrow(denied);
    await expect(as(db, admin, () => q(`select public.apply_payment_event('mercadopago','e0','payment','{}',true,$1,'1','approved',189000,'COP')`, [ref]))).rejects.toThrow(denied);
  });
  it("rechaza firma inválida, pago desconocido y monto o moneda distintos (sin aprobar)", async () => {
    expect((await ev("e1", ref, "approved", 189000, { sig: false }))[0].r).toBe("invalid_signature");
    expect((await ev("e2", "pay-desconocido", "approved", 189000))[0].r).toBe("unknown_payment");
    expect((await ev("e3", ref, "approved", 1))[0].r).toBe("amount_mismatch");
    expect((await ev("e4", ref, "approved", 189000, { cur: "USD" }))[0].r).toBe("amount_mismatch");
    expect((await q<{ s: string }>(`select status s from payments where id = $1`, [payId]))[0].s).toBe("pending");
    expect((await q<{ p: string | null }>(`select paid_at p from orders where id = $1`, [orderId]))[0].p).toBeNull();
  });
  it("aprueba una sola vez: los eventos repetidos son idempotentes", async () => {
    expect((await ev("e5", ref, "approved", 189000))[0].r).toBe("approved");
    expect((await ev("e5", ref, "approved", 189000))[0].r).toBe("duplicate");
    expect((await ev("e6", ref, "approved", 189000))[0].r).toBe("noop");
    const [p] = await q<{ status: string; approved_at: string | null }>(`select status, approved_at from payments where id = $1`, [payId]);
    expect(p.status).toBe("approved");
    expect(p.approved_at).not.toBeNull();
    expect((await q<{ p: string | null }>(`select paid_at p from orders where id = $1`, [orderId]))[0].p).not.toBeNull();
    expect((await as(db, cliA, () => q(`select id from notifications where type = 'payment.approved'`))).length).toBe(1);
    expect((await as(db, admin, () => q(`select id from notifications where type = 'order.paid'`))).length).toBe(1);
    expect((await q(`select 1 from payment_events where provider_event_id = 'e5'`)).length).toBe(1);
  });
  it("un evento tardío 'pending' o 'rejected' no revierte un pago aprobado; un reembolso sí es válido", async () => {
    expect((await ev("e7", ref, "pending", 189000))[0].r).toBe("ignored_transition");
    expect((await ev("e8", ref, "rejected", 189000))[0].r).toBe("ignored_transition");
    expect((await q<{ s: string }>(`select status s from payments where id = $1`, [payId]))[0].s).toBe("approved");
    expect((await ev("e9", ref, "refunded", 189000))[0].r).toBe("refunded");
  });
  it("un pedido pagado no se cancela ni se avanza sin pago; el personal avanza el flujo logístico", async () => {
    await expect(as(db, cliA, () => q(`select public.cancel_order($1)`, [orderId]))).rejects.toThrow(/order_not_cancellable/);
    const [{ id: unpaid }] = await order(cliA, [{ product_id: mouse, qty: 1 }]);
    await expect(as(db, admin, () => q(`update orders set status = 'shipped' where id = $1`, [unpaid]))).rejects.toThrow(/order_not_paid/);
    await as(db, admin, () => q(`update orders set status = 'preparing' where id = $1`, [orderId]));
    await as(db, cliA, () => q(`select public.cancel_order($1)`, [unpaid]));
  });
  it("el pago manual solo lo confirma un administrador y queda auditado", async () => {
    const [{ id }] = await order(cliA, [{ product_id: mouse, qty: 1 }]);
    await expect(q(`select public.record_manual_payment($1,$2,'cash')`, [cliA, id])).rejects.toThrow(/forbidden/);
    await expect(q(`select public.record_manual_payment($1,$2,'bitcoin')`, [admin, id])).rejects.toThrow(/invalid_method/);
    await q(`select public.record_manual_payment($1,$2,'cash')`, [admin, id]);
    expect((await q(`select 1 from audit_logs where action = 'payment.manual_confirmed'`)).length).toBe(1);
    await expect(q(`select public.record_manual_payment($1,$2,'cash')`, [admin, id])).rejects.toThrow(/order_not_payable/);
  });
  it("los pedidos sin pagar vencidos se cancelan y devuelven el stock", async () => {
    const before = await stock(mouse);
    const [{ id }] = await order(cliB, [{ product_id: mouse, qty: 1 }]);
    expect(await stock(mouse)).toBe(before - 1);
    await q(`update orders set expires_at = now() - interval '1 hour' where id = $1`, [id]);
    const [{ n }] = await q<{ n: number }>(`select public.expire_pending_orders() n`);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await stock(mouse)).toBe(before);
    expect((await q<{ s: string }>(`select status s from orders where id = $1`, [id]))[0].s).toBe("cancelled");
    await expect(q(`select * from public.begin_payment($1,$2)`, [id, cliB])).rejects.toThrow(/order_not_payable/);
  });
});

describe("tareas periódicas", () => {
  it("avisa del mantenimiento una sola vez, vence garantías y cotizaciones, y solo service_role la ejecuta", async () => {
    await expect(as(db, cliA, () => q(`select public.run_housekeeping()`))).rejects.toThrow(denied);
    const [{ id: eqId }] = await q<{ id: string }>(`insert into equipment (customer_id, type, brand, model) values ($1,'laptop','HP','x') returning id`, [custA]);
    await q(`insert into maintenance_plans (customer_id, equipment_id, due_at) values ($1,$2, now() + interval '3 days')`, [custA, eqId]);
    await q(`insert into warranties (kind, customer_id, equipment_id, order_item_id, description, start_date, end_date)
             select 'product', $1, $2, oi.id, 'SSD', current_date - 400, current_date - 1 from order_items oi limit 1`, [custA, eqId]);
    const [{ r }] = await q<{ r: { maintenance_reminders: number; warranties_expired: number } }>(`select public.run_housekeeping() r`);
    expect(r.maintenance_reminders).toBe(1);
    expect(r.warranties_expired).toBeGreaterThanOrEqual(1);
    expect((await as(db, cliA, () => q(`select id from notifications where type = 'maintenance.due'`))).length).toBe(1);
    const [{ r: again }] = await q<{ r: { maintenance_reminders: number } }>(`select public.run_housekeeping() r`);
    expect(again.maintenance_reminders).toBe(0); // idempotente
  });
});

describe("cola de correos", () => {
  it("reclama solo avisos importantes, respeta preferencias, no duplica y solo service_role la usa", async () => {
    await expect(as(db, cliA, () => q(`select * from public.claim_email_notifications(5)`))).rejects.toThrow(denied);
    await q(`insert into notifications (recipient_id, type, title) values ($1,'quote.sent','Cotización lista'), ($1,'ticket.assigned','Interno'), ($2,'quote.sent','No quiere correo')`, [cliA, cliB]);
    await q(`insert into notification_preferences (profile_id, email_enabled) values ($1, false)`, [cliB]);
    const first = await q<{ to_email: string; title: string }>(`select to_email, title from public.claim_email_notifications(50)`);
    expect(first.filter((r) => r.title === "Cotización lista")).toEqual([{ to_email: "a@gmail.com", title: "Cotización lista" }]);
    expect(first.some((r) => r.title === "Interno")).toBe(false);
    expect(first.some((r) => r.title === "No quiere correo")).toBe(false);
    const second = await q<{ title: string }>(`select title from public.claim_email_notifications(50)`);
    expect(second.some((r) => r.title === "Cotización lista")).toBe(false); // ya reclamado: sin duplicados
    expect((await q<{ n: number }>(`select public.skip_non_email_notifications() n`))[0].n).toBeGreaterThanOrEqual(1);
  });
});

describe("reportes", () => {
  it("solo administración los consulta y devuelve agregados", async () => {
    await expect(as(db, cliA, () => q(`select public.admin_report(current_date - 30, current_date)`))).rejects.toThrow(denied);
    await expect(as(db, admin, () => q(`select public.admin_report(current_date, current_date - 1)`))).rejects.toThrow(/invalid_range/);
    await expect(as(db, admin, () => q(`select public.admin_report(current_date - 800, current_date)`))).rejects.toThrow(/invalid_range/);
    const [{ r }] = await as(db, admin, () => q<{ r: Record<string, unknown> }>(`select public.admin_report(current_date - 30, current_date + 1) r`));
    expect(Number(r.revenue_cop)).toBeGreaterThanOrEqual(0);
    expect(r).toHaveProperty("tickets_by_status");
    expect(JSON.stringify(r)).not.toMatch(/@|full_name|phone/);
  });
});
