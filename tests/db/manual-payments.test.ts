import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let owner: string, tech: string, tech2: string, cliA: string, cliB: string, custA: string, diag: string, svc: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;
const pay = (actor: string, kind: string, ref: string, method: string, reference: string | null = null, voucher: string | null = null) =>
  q<{ id: string }>(`select public.record_manual_service_payment_v2($1,$2,$3,$4,$5,null,$6) id`, [actor, kind, ref, method, reference, voucher]).then((r) => r[0].id);

async function ticket(service: string, assigned = tech): Promise<string> {
  const [{ id }] = await q<{ id: string }>(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','Falla de prueba',$3) returning id`, [custA, service, assigned]);
  return id;
}
const voucher = async (t: string) =>
  (await q<{ id: string }>(`insert into evidence (ticket_id, stage, slot, cloudinary_public_id) values ($1,'payment','voucher',$2) returning id`, [t, `pay/${t}/${Math.random()}`]))[0].id;
const status = async (id: string) => (await q<{ s: string }>(`select status s from payments where id = $1`, [id]))[0].s;

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
  diag = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, is_diagnostic_fee, requires_equipment) values ('dg','Diagnóstico de prueba','technical',39900,'{store,home}',true,false) returning id`))[0].id;
  svc = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment) values ('rep','Reparación de prueba','technical',150000,'{store,home}',false) returning id`))[0].id;
}, 180000);

describe("pago manual del diagnóstico (v2)", () => {
  it("efectivo: se confirma al registrar, crea el abono y deja método, monto, usuario y fecha", async () => {
    const t = await ticket(diag);
    const id = await pay(owner, "diagnosis", t, "cash", null);
    const [p] = await q<{ status: string; method: string; amount: string; confirmed_by: string; approved_at: string }>(`select status, method, amount, confirmed_by, approved_at from payments where id = $1`, [id]);
    expect(p).toMatchObject({ status: "approved", method: "cash", confirmed_by: owner });
    expect(Number(p.amount)).toBe(39900);
    expect(p.approved_at).toBeTruthy();
    expect((await q(`select 1 from diagnosis_credits where ticket_id = $1`, [t])).length).toBe(1);
  });

  it("no se puede cobrar dos veces el mismo concepto (Mercado Pago aprobado + efectivo)", async () => {
    const t = await ticket(diag);
    const [{ payment_id, external_reference }] = await q<{ payment_id: string; external_reference: string }>(`select * from public.begin_service_payment($1,'diagnosis',$2)`, [cliA, t]);
    await q(`select public.apply_payment_event('mercadopago','evt-mp-1','payment','{}'::jsonb,true,$1,'mp-1','approved'::payment_status,39900,'COP')`, [external_reference]);
    expect(await status(payment_id)).toBe("approved");
    await expect(pay(owner, "diagnosis", t, "cash")).rejects.toThrow(/diagnosis_already_paid/);
    await expect(pay(tech, "diagnosis", t, "cash")).rejects.toThrow(/diagnosis_already_paid/);
    expect(Number((await q<{ n: string }>(`select count(*) n from payments where ticket_id = $1 and status = 'approved'`, [t]))[0].n)).toBe(1);
  });

  it("con un pago en línea en validación NO se registra uno manual ni se anula el pendiente", async () => {
    const t = await ticket(diag);
    const [{ payment_id }] = await q<{ payment_id: string }>(`select * from public.begin_service_payment($1,'diagnosis',$2)`, [cliA, t]);
    await expect(pay(owner, "diagnosis", t, "cash")).rejects.toThrow(/payment_in_validation/);
    expect(await status(payment_id)).toBe("pending");
  });

  it("datáfono: el comprobante es obligatorio y debe ser de este ticket, etapa de pago y no reutilizado", async () => {
    const t = await ticket(diag);
    await expect(pay(tech, "diagnosis", t, "datafono", "AP-1")).rejects.toThrow(/voucher_required/);
    const other = await ticket(diag);
    await expect(pay(tech, "diagnosis", t, "datafono", "AP-1", await voucher(other))).rejects.toThrow(/voucher_invalid/);
    const reception = (await q<{ id: string }>(`insert into evidence (ticket_id, stage, slot, cloudinary_public_id) values ($1,'reception','front',$2) returning id`, [t, `r/${t}`]))[0].id;
    await expect(pay(tech, "diagnosis", t, "datafono", "AP-1", reception)).rejects.toThrow(/voucher_invalid/);
    const v = await voucher(t);
    const id = await pay(tech, "diagnosis", t, "datafono", "AP-77", v);
    const [p] = await q<{ status: string; method: string; reference: string; voucher_evidence_id: string; confirmed_by: string }>(`select status, method, reference, voucher_evidence_id, confirmed_by from payments where id = $1`, [id]);
    expect(p).toMatchObject({ status: "approved", method: "datafono", reference: "AP-77", voucher_evidence_id: v, confirmed_by: tech });
    // el mismo comprobante no sirve para otro cobro
    const t2 = await ticket(diag);
    await expect(pay(tech, "diagnosis", t2, "datafono", "AP-77", v)).rejects.toThrow(/voucher_invalid/);
  });

  it("transferencia: queda pendiente de validación y solo el SUPERADMIN la confirma", async () => {
    const t = await ticket(diag);
    const id = await pay(tech, "diagnosis", t, "bank_transfer", "TRX-9");
    expect(await status(id)).toBe("pending");
    expect((await q(`select 1 from diagnosis_credits where ticket_id = $1`, [t])).length).toBe(0); // todavía no cuenta como pagado
    await expect(pay(owner, "diagnosis", t, "cash")).rejects.toThrow(/payment_in_validation/); // no se duplica
    await expect(q(`select public.confirm_manual_payment($1,$2)`, [tech, id])).rejects.toThrow(/forbidden/);
    await expect(as(db, tech, () => q(`select public.confirm_manual_payment($1,$2)`, [tech, id]))).rejects.toThrow(denied);
    await q(`select public.confirm_manual_payment($1,$2)`, [owner, id]);
    expect(await status(id)).toBe("approved");
    expect((await q(`select 1 from diagnosis_credits where ticket_id = $1`, [t])).length).toBe(1);
    await expect(q(`select public.confirm_manual_payment($1,$2)`, [owner, id])).rejects.toThrow(/payment_not_pending/);
  });

  it("una transferencia pendiente no vence sola, pero un pago en línea abandonado sí", async () => {
    const t = await ticket(diag);
    const manual = await pay(tech, "diagnosis", t, "bank_transfer");
    const t2 = await ticket(diag);
    const [{ payment_id: online }] = await q<{ payment_id: string }>(`select * from public.begin_service_payment($1,'diagnosis',$2)`, [cliA, t2]);
    await q(`update payments set created_at = now() - interval '3 days' where id in ($1,$2)`, [manual, online]);
    await q(`select public.expire_pending_service_payments()`);
    expect(await status(manual)).toBe("pending");
    expect(await status(online)).toBe("expired");
  });

  it("anular un intento pendiente exige SUPERADMIN y motivo; después se puede registrar el cobro", async () => {
    const t = await ticket(diag);
    const [{ payment_id }] = await q<{ payment_id: string }>(`select * from public.begin_service_payment($1,'diagnosis',$2)`, [cliA, t]);
    await expect(q(`select public.cancel_pending_payment($1,$2,'abandonado')`, [tech, payment_id])).rejects.toThrow(/forbidden/);
    await expect(q(`select public.cancel_pending_payment($1,$2,'')`, [owner, payment_id])).rejects.toThrow(/reason_required/);
    await q(`select public.cancel_pending_payment($1,$2,'El cliente abandonó el pago')`, [owner, payment_id]);
    expect(await status(payment_id)).toBe("cancelled");
    expect((await q(`select 1 from audit_logs where action = 'payment.cancelled' and entity_id = $1`, [payment_id])).length).toBe(1);
    const id = await pay(tech, "diagnosis", t, "cash");
    expect(await status(id)).toBe("approved");
  });

  it("permisos: el técnico solo cobra tickets asignados a él; el cliente nunca; método inválido rechazado", async () => {
    const t = await ticket(diag);
    await expect(pay(tech2, "diagnosis", t, "cash")).rejects.toThrow(/forbidden/);
    await expect(pay(cliA, "diagnosis", t, "cash")).rejects.toThrow(/forbidden/);
    await expect(as(db, cliA, () => pay(cliA, "diagnosis", t, "cash"))).rejects.toThrow(denied);
    await expect(as(db, tech, () => pay(tech, "diagnosis", t, "cash"))).rejects.toThrow(denied); // solo service_role
    await expect(pay(tech, "diagnosis", t, "bitcoin")).rejects.toThrow(/invalid_method/);
    expect((await q(`select 1 from payments where ticket_id = $1`, [t])).length).toBe(0);
  });

  it("la función anterior ya no es invocable por service_role (no anulaba pagos en validación sin control)", async () => {
    const [r] = await q<{ ok: boolean }>(`select has_function_privilege('service_role','public.record_manual_service_payment(uuid,text,uuid,text)','execute') ok`);
    expect(r.ok).toBe(false);
    const [r2] = await q<{ ok: boolean }>(`select has_function_privilege('service_role','public.record_manual_service_payment_v2(uuid,text,uuid,text,text,text,uuid)','execute') ok`);
    expect(r2.ok).toBe(true);
    const [r3] = await q<{ ok: boolean }>(`select has_function_privilege('authenticated','public.record_manual_service_payment_v2(uuid,text,uuid,text,text,text,uuid)','execute') ok`);
    expect(r3.ok).toBe(false);
  });

  it("lectura: el técnico asignado ve los cobros de su ticket; otro técnico y otro cliente no", async () => {
    const t = await ticket(diag);
    const id = await pay(owner, "diagnosis", t, "cash");
    expect((await as(db, tech, () => q(`select id from payments where id = $1`, [id]))).length).toBe(1);
    expect((await as(db, cliA, () => q(`select id from payments where id = $1`, [id]))).length).toBe(1);
    expect((await as(db, tech2, () => q(`select id from payments where id = $1`, [id]))).length).toBe(0);
    expect((await as(db, cliB, () => q(`select id from payments where id = $1`, [id]))).length).toBe(0);
  });
});

describe("cotización por conceptos y diagnóstico finalizado", () => {
  async function diagnosingTicket(): Promise<string> {
    const t = await ticket(svc);
    await q(`insert into receptions (ticket_id, reason) values ($1,'Falla')`, [t]);
    for (let i = 0; i < 4; i++) await q(`insert into evidence (ticket_id, stage, cloudinary_public_id) values ($1,'reception',$2)`, [t, `e/${t}/${i}`]);
    await as(db, tech, () => q(`select public.transition_ticket($1,'diagnosing')`, [t]));
    return t;
  }

  it("el concepto se guarda por línea y el total sigue saliendo del catálogo", async () => {
    const t = await diagnosingTicket();
    const [{ id: qid }] = await as(db, tech, () => q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [t, custA]));
    await as(db, tech, () => q(`insert into quote_items (quote_id, position, kind, service_id, description, qty, concept, priority, suggested_by_system) values ($1,1,'service',$2,'Reparación',1,'labor','required',true)`, [qid, svc]));
    await as(db, tech, () => q(`insert into quote_items (quote_id, position, kind, description, qty, unit_price, concept) values ($1,2,'custom','Pasta térmica',1,20000,'part')`, [qid]));
    const items = await q<{ concept: string; suggested_by_system: boolean; line_subtotal: string }>(`select concept, suggested_by_system, line_subtotal from quote_items where quote_id = $1 order by position`, [qid]);
    expect(items.map((i) => i.concept)).toEqual(["labor", "part"]);
    expect(items[0].suggested_by_system).toBe(true);
    expect(Number((await q<{ total: string }>(`select total from quotes where id = $1`, [qid]))[0].total)).toBe(170000);
    await expect(as(db, tech, () => q(`insert into quote_items (quote_id, position, kind, description, qty, unit_price, concept) values ($1,3,'custom','X',1,1,'inventado')`, [qid]))).rejects.toThrow();
  });

  it("al aprobar, la cotización deja constancia del PDF exacto revisado (código, versión y SHA-256)", async () => {
    const t = await diagnosingTicket();
    const [{ id: qid }] = await as(db, tech, () => q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [t, custA]));
    await as(db, tech, () => q(`insert into quote_items (quote_id, position, kind, service_id, description, qty) values ($1,1,'service',$2,'Reparación',1)`, [qid, svc]));
    await as(db, tech, () => q(`select public.send_quote($1)`, [qid]));
    const sha = "ab".repeat(32);
    await q(`insert into documents (doc_type, version, status, title, customer_id, ticket_id, quote_id, storage_path, sha256) values ('quote',1,'generated','Cotización',$1,$2,$3,'tickets/x/COT-v1.pdf',$4)`, [custA, t, qid, sha]);
    await as(db, cliA, () => q(`select public.decide_quote($1,'approve',null)`, [qid]));
    const [ev] = await q<{ message: string }>(`select message from quote_events where quote_id = $1 and event_type = 'approved'`, [qid]);
    expect(ev.message).toContain(sha);
    expect(ev.message).toMatch(/Aprobada sobre el documento .* v1/);
    const [au] = await q<{ metadata: { document_sha256: string; document_version: number } }>(`select metadata from audit_logs where action = 'quote.approved' and entity_id = $1`, [qid]);
    expect(au.metadata.document_sha256).toBe(sha);
    expect(au.metadata.document_version).toBe(1);
    // el cliente sigue sin poder aprobar dos veces ni la cotización de otro
    await expect(as(db, cliA, () => q(`select public.decide_quote($1,'approve',null)`, [qid]))).rejects.toThrow(/quote_not_open/);
  });

  it("finalizar diagnóstico: solo personal con acceso al ticket; deja constancia y lo hace visible al cliente", async () => {
    const t = await diagnosingTicket();
    await expect(as(db, tech, () => q(`select public.finalize_diagnosis($1)`, [t]))).rejects.toThrow(/diagnosis_missing/);
    await as(db, tech, () => q(`insert into diagnostics (ticket_id, version, summary) values ($1,1,'Ventilador obstruido')`, [t]));
    expect((await as(db, cliA, () => q(`select id from diagnostics where ticket_id = $1`, [t]))).length).toBe(0); // aún oculto
    await expect(as(db, cliA, () => q(`select public.finalize_diagnosis($1)`, [t]))).rejects.toThrow(denied);
    await expect(as(db, tech2, () => q(`select public.finalize_diagnosis($1)`, [t]))).rejects.toThrow(denied);
    await as(db, tech, () => q(`select public.finalize_diagnosis($1)`, [t]));
    const [d] = await as(db, cliA, () => q<{ finalized_at: string | null }>(`select finalized_at from diagnostics where ticket_id = $1`, [t]));
    expect(d.finalized_at).toBeTruthy();
    expect((await q(`select 1 from audit_logs where action = 'diagnosis.finalized'`)).length).toBeGreaterThan(0);
    // el técnico no puede fijar la fecha ni al autor por su cuenta
    await expect(as(db, tech, () => q(`update diagnostics set finalized_at = null where ticket_id = $1`, [t]))).rejects.toThrow(denied);
  });
});
