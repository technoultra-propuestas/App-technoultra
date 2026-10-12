import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let owner: string, tech: string, tech2: string, cliA: string, cliB: string, custA: string, diag: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;
const num = (v: unknown) => Number(v);
let evt = 0;

const status = async (t: string) => (await q<{ s: string }>(`select status s from tickets where id = $1`, [t]))[0].s;
const summary = async (quote: string, who = cliA) => (await as(db, who, () => q<{ s: Record<string, unknown> }>(`select public.quote_payment_summary($1) s`, [quote])))[0].s;
const begin = (quote: string, plan: string, actor = cliA) =>
  q<{ payment_id: string; amount: string; external_reference: string }>(`select * from public.begin_quote_payment($1,$2,$3)`, [actor, quote, plan]).then((r) => r[0]);
const mp = (ref: string, st: string, amount: number) =>
  q<{ r: string }>(`select public.apply_payment_event('mercadopago',$1,'order','{}'::jsonb,true,$2,$3,$4::payment_status,$5,'COP') r`, [`ev-${++evt}`, ref, `mp-${evt}`, st, amount]).then((r) => r[0].r);

/**
 * Ticket con el diagnóstico pagado ($39.900 → crédito) y una cotización de $559.600 enviada al cliente:
 * total neto = $519.700 (el caso del enunciado).
 */
async function sentQuote(subtotal = 559600): Promise<{ t: string; quote: string }> {
  const [{ id: t }] = await q<{ id: string }>(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','Pantalla rota',$3) returning id`, [custA, diag, tech]);
  await q(`select public.record_manual_service_payment_v2($1,'diagnosis',$2,'cash',null,null,null)`, [tech, t]);
  await q(`insert into receptions (ticket_id, reason, received_by) values ($1,'Pantalla',$2)`, [t, tech]);
  for (let i = 0; i < 4; i++) await q(`insert into evidence (ticket_id, stage, cloudinary_public_id) values ($1,'reception',$2)`, [t, `e/${t}/${i}`]);
  if ((await status(t)) === "received") await as(db, tech, () => q(`select public.transition_ticket($1,'diagnosing')`, [t]));
  const [{ id: quote }] = await as(db, tech, () => q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [t, custA]));
  await as(db, tech, () => q(`insert into quote_items (quote_id, kind, concept, description, qty, unit_price) values ($1,'custom','labor','Cambio de pantalla y mano de obra',1,$2)`, [quote, subtotal]));
  await as(db, tech, () => q(`select public.send_quote($1)`, [quote]));
  return { t, quote };
}
async function approved(subtotal?: number) {
  const r = await sentQuote(subtotal);
  await as(db, cliA, () => q(`select public.decide_quote($1,'approve',null)`, [r.quote]));
  return r;
}

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@technoultra.com");
  await makeAdmin(db, owner);
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, owner, tech);
  tech2 = await createUser(db, "tec2@technoultra.com");
  await makeTechnician(db, owner, tech2);
  cliA = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
  cliB = await createUser(db, "b@gmail.com", { full_name: "Cliente B" });
  custA = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliA]))[0].id;
  diag = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, is_diagnostic_fee, requires_equipment) values ('dg','Diagnóstico','technical',39900,'{store,home}',true,false) returning id`))[0].id;
}, 180000);

describe("aprobación y resumen económico", () => {
  it("al aprobar NO se inicia el servicio: queda esperando el pago y se ofrecen las dos modalidades con importes del servidor", async () => {
    const { t, quote } = await approved();
    expect(await status(t)).toBe("awaiting_approval");
    const s = await summary(quote);
    expect(num(s.diagnosis_credit)).toBe(39900);
    expect(num(s.base)).toBe(519700); // 559.600 − 39.900: el crédito se aplica UNA vez
    expect(num(s.deposit_amount)).toBe(259850);
    expect(num(s.deposit_remaining)).toBe(259850);
    expect(num(s.full_discount)).toBe(25985);
    expect(num(s.full_amount)).toBe(493715);
    expect(s.can_choose).toBe(true);
    expect(s.can_pay_balance).toBe(false);
    // el cliente recibe el aviso de elegir cómo pagar; el técnico, que espere el pago
    expect((await q(`select 1 from notifications where recipient_id = $1 and type = 'quote.decision' and body like '%anticipo del 50 %%'`, [cliA])).length).toBeGreaterThan(0);
  });

  it("el personal no puede iniciar el servicio a mano mientras no haya pago confirmado", async () => {
    const { t } = await approved();
    await expect(as(db, tech, () => q(`select public.transition_ticket($1,'in_service')`, [t]))).rejects.toThrow(/quote_payment_pending/);
    expect(await status(t)).toBe("awaiting_approval");
  });

  it("un cliente no puede ver el resumen ni pagar la cotización de otro", async () => {
    const { quote } = await approved();
    await expect(summary(quote, cliB)).rejects.toThrow(denied);
    await expect(begin(quote, "deposit", cliB)).rejects.toThrow(/not_found/);
    await expect(as(db, cliA, () => q(`select * from public.begin_quote_payment($1,$2,'deposit')`, [cliA, quote]))).rejects.toThrow(denied);
  });
});

describe("anticipo del 50 %", () => {
  it("pendiente: no inicia nada; confirmado: registra importe y modalidad, deja saldo y habilita el servicio", async () => {
    const { t, quote } = await approved();
    const p = await begin(quote, "deposit");
    expect(num(p.amount)).toBe(259850);
    // doble clic / volver a la pantalla: se reutiliza el mismo cobro, no se crea otro
    expect((await begin(quote, "deposit")).payment_id).toBe(p.payment_id);
    // con el anticipo en validación no se puede elegir el total ni registrar un manual
    await expect(begin(quote, "full")).rejects.toThrow(/payment_in_validation/);
    await expect(q(`select public.record_manual_quote_payment($1,$2,'full','cash')`, [tech, quote])).rejects.toThrow(/payment_in_validation/);
    expect(await status(t)).toBe("awaiting_approval");

    expect(await mp(p.external_reference, "approved", 259850)).toBe("approved");
    expect(await mp(p.external_reference, "approved", 259850)).toMatch(/noop|duplicate/); // webhook repetido
    expect(await status(t)).toBe("in_service");
    const [row] = await q<{ installment: string; discount_amount: string; pricing_detail: Record<string, unknown> }>(`select installment, discount_amount, pricing_detail from payments where id = $1`, [p.payment_id]);
    expect(row.installment).toBe("deposit");
    expect(num(row.discount_amount)).toBe(0); // el 5 % NO aplica al anticipo
    expect(row.pricing_detail).toMatchObject({ plan: "deposit", base: 519700, diagnosis_credit: 39900, discount: 0, amount: 259850 });
    const s = await summary(quote);
    expect(s).toMatchObject({ plan: "deposit", paid_in_full: false, can_choose: false });
    expect(num(s.paid)).toBe(259850);
    expect(num(s.balance)).toBe(259850);
    const [qq] = await q<{ amount_paid: string; paid_at: string | null; payment_plan: string }>(`select amount_paid, paid_at, payment_plan from quotes where id = $1`, [quote]);
    expect(num(qq.amount_paid)).toBe(259850);
    expect(qq.paid_at).toBeNull();
    expect(qq.payment_plan).toBe("deposit");
    // un solo aviso de anticipo para cliente, técnico y SUPERADMIN
    expect((await q(`select 1 from notifications where recipient_id = $1 and type = 'payment.approved' and title = '¡Pago confirmado!' and entity_id = $2`, [cliA, t])).length).toBe(1);
    expect((await q(`select 1 from notifications where recipient_id = $1 and type = 'payment.cleared' and title like 'Anticipo confirmado%' and entity_id = $2`, [tech, t])).length).toBe(1);
    expect((await q(`select 1 from notifications where recipient_id = $1 and type = 'payment.quote' and entity_id = $2`, [owner, t])).length).toBe(1);
    expect((await q(`select 1 from notifications where recipient_id = $1 and entity_id = $2`, [tech2, t])).length).toBe(0);
  });

  it("saldo restante: sin descuento, sin volver a cobrar el anticipo; liquida en cero y solo entonces permite entregar", async () => {
    const { t, quote } = await approved();
    const d = await begin(quote, "deposit");
    await mp(d.external_reference, "approved", 259850);
    // no se puede elegir otra vez ninguna modalidad
    await expect(begin(quote, "deposit")).rejects.toThrow(/plan_already_chosen/);
    await expect(begin(quote, "full")).rejects.toThrow(/plan_already_chosen/);
    // la entrega exige el saldo pagado
    await q(`update tickets set status = 'ready' where id = $1`, [t]);
    await q(`insert into deliveries (ticket_id, received_by_name) values ($1, 'Cliente A')`, [t]).catch(() => undefined);
    await expect(as(db, tech, () => q(`select public.transition_ticket($1,'delivered')`, [t]))).rejects.toThrow(/balance_pending|delivery_record_missing/);
    const b = await begin(quote, "balance");
    expect(num(b.amount)).toBe(259850);
    await mp(b.external_reference, "approved", 259850);
    const s = await summary(quote);
    expect(num(s.balance)).toBe(0);
    expect(s.paid_in_full).toBe(true);
    expect(s.can_pay_balance).toBe(false);
    expect(num(s.discount)).toBe(0);
    expect((await q<{ paid_at: string | null }>(`select paid_at from quotes where id = $1`, [quote]))[0].paid_at).not.toBeNull();
    await expect(begin(quote, "balance")).rejects.toThrow(/quote_already_paid/);
  });

  it("pago rechazado o cancelado: el servicio NO se inicia, no hay aviso de éxito y se puede reintentar", async () => {
    const { t, quote } = await approved();
    const p = await begin(quote, "deposit");
    await mp(p.external_reference, "rejected", 259850);
    expect(await status(t)).toBe("awaiting_approval");
    // (el aviso del diagnóstico pagado en la preparación es otro; aquí se mira el de la cotización)
    expect((await q(`select 1 from notifications where recipient_id = $1 and type = 'payment.approved' and entity_id = $2 and title in ('¡Pago confirmado!', 'Pago completo confirmado', 'Saldo pagado')`, [cliA, t])).length).toBe(0);
    expect((await summary(quote)).can_choose).toBe(true);
    const again = await begin(quote, "full"); // tras un rechazo puede elegir otra modalidad
    expect(again.payment_id).not.toBe(p.payment_id);
  });
});

describe("pago total con 5 % de descuento", () => {
  it("descuento sobre el saldo neto, saldo en cero, auditable y el servicio habilitado", async () => {
    const { t, quote } = await approved();
    const p = await begin(quote, "full");
    expect(num(p.amount)).toBe(493715);
    await mp(p.external_reference, "approved", 493715);
    await mp(p.external_reference, "approved", 493715); // repetido: no aplica el descuento dos veces
    expect(await status(t)).toBe("in_service");
    const s = await summary(quote);
    expect(num(s.paid)).toBe(493715);
    expect(num(s.discount)).toBe(25985);
    expect(num(s.balance)).toBe(0);
    expect(s).toMatchObject({ plan: "full", paid_in_full: true, can_choose: false, can_pay_balance: false });
    const [row] = await q<{ discount_amount: string; pricing_detail: Record<string, unknown> }>(`select discount_amount, pricing_detail from payments where id = $1`, [p.payment_id]);
    expect(num(row.discount_amount)).toBe(25985);
    expect(row.pricing_detail).toMatchObject({ plan: "full", discount_rate: 5, base: 519700, amount: 493715 });
    await expect(begin(quote, "balance")).rejects.toThrow(/quote_already_paid/);
    expect((await q(`select 1 from notifications where recipient_id = $1 and title = 'Pago completo confirmado'`, [cliA])).length).toBe(1);
  });

  it("el monto lo fija el servidor: un evento con un importe distinto se rechaza y no inicia el servicio", async () => {
    const { t, quote } = await approved();
    const p = await begin(quote, "full");
    expect(await mp(p.external_reference, "approved", 519700)).toBe("amount_mismatch"); // sin descuento
    expect(await status(t)).toBe("awaiting_approval");
  });
});

describe("pagos manuales de la cotización", () => {
  it("efectivo del técnico asignado: anticipo confirmado e inicio; otro técnico no puede; transferencia queda pendiente", async () => {
    const { t, quote } = await approved();
    await expect(q(`select public.record_manual_quote_payment($1,$2,'deposit','cash')`, [tech2, quote])).rejects.toThrow(/forbidden/);
    await q(`select public.record_manual_quote_payment($1,$2,'deposit','cash')`, [tech, quote]);
    expect(await status(t)).toBe("in_service");
    expect(num((await summary(quote)).balance)).toBe(259850);
    await q(`select public.record_manual_quote_payment($1,$2,'balance','bank_transfer','TRX-9')`, [tech, quote]);
    expect(num((await summary(quote)).balance)).toBe(259850); // pendiente de validación: no reduce el saldo
    expect((await summary(quote)).pending_plan).toBe("balance");
  });

  it("el camino genérico ya no cobra cotizaciones sin modalidad", async () => {
    const { quote } = await approved();
    await expect(q(`select * from public.begin_service_payment($1,'quote',$2)`, [cliA, quote])).rejects.toThrow(/plan_required/);
    await expect(q(`select public.record_manual_service_payment_v2($1,'quote',$2,'cash')`, [tech, quote])).rejects.toThrow(/plan_required/);
  });

  it("si el crédito cubre todo, la aprobación inicia el servicio sin cobro", async () => {
    const { t, quote } = await approved(30000); // menos que el crédito de 39.900
    expect(num((await summary(quote)).base)).toBe(0);
    expect(await status(t)).toBe("in_service");
    await expect(begin(quote, "full")).rejects.toThrow(/nothing_to_pay/);
  });
});
