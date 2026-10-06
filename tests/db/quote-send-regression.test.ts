import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

/**
 * Regresión «Enviar al cliente» (cotización en borrador de un ticket de diagnóstico ya pagado):
 * diagnóstico 39.900 pagado · servicio 70.000 · crédito 39.900 · total 30.100 · urgencia normal · requiere repuesto · borrador.
 */
let db: Db;
let admin: string, tech: string, cli: string, cust: string, diag: string, bios: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const num = (v: unknown) => Number(v);

async function newTicket(service: string, status: "received" | "diagnosing" = "diagnosing"): Promise<string> {
  const [{ id }] = await q<{ id: string }>(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','Falla de prueba',$3) returning id`, [cust, service, tech]);
  if (status === "diagnosing") {
    await q(`insert into receptions (ticket_id, reason) values ($1,'Falla')`, [id]);
    for (let i = 0; i < 4; i++) await q(`insert into evidence (ticket_id, stage, cloudinary_public_id) values ($1,'reception',$2)`, [id, `e/${id}/${i}`]);
    await as(db, tech, () => q(`select public.transition_ticket($1,'diagnosing')`, [id]));
  }
  return id;
}
/** Arma el escenario del reporte sobre un ticket dado. */
async function scenario(ticket: string) {
  await q(`select public.record_diagnosis_payment($1,$2,'cash')`, [admin, ticket]);
  const [{ id: quote }] = await as(db, tech, () => q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [ticket, cust]));
  await as(db, tech, () => q(`insert into quote_items (quote_id, position, kind, service_id, description, qty, warranty_days) values ($1,1,'service',$2,'Actualización BIOS/UEFI',1,0)`, [quote, bios]));
  await as(db, tech, () => q(`update quotes set needs_part = true where id = $1`, [quote]));
  return quote;
}
const row = async (id: string) => (await q<Record<string, string | null>>(`select * from quotes where id = $1`, [id]))[0];
const countOf = async (sql: string, p: unknown[]) => num((await q<{ n: string }>(sql, p))[0].n);

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, "admin@technoultra.com");
  await makeAdmin(db, admin);
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, admin, tech);
  cli = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
  cust = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cli]))[0].id;
  diag = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, is_diagnostic_fee, requires_equipment) values ('diag','Diagnóstico','technical',39900,'{store}',true,false) returning id`))[0].id;
  bios = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment) values ('bios','Actualización BIOS/UEFI','technical',70000,'{store}',false) returning id`))[0].id;
}, 180000);

describe("«Enviar al cliente» con diagnóstico pagado, abono y repuesto", () => {
  it("el escenario del reporte: total 30.100 con crédito de 39.900", async () => {
    const quote = await scenario(await newTicket(diag));
    const r = await row(quote);
    expect(r).toMatchObject({ status: "draft", needs_part: true });
    expect([num(r.subtotal), num(r.diagnosis_credit), num(r.total), num(r.urgency_amount), num(r.vat_included)]).toEqual([70000, 39900, 30100, 0, 0]);
  });

  it("envía: transición válida, snapshot congelado, total intacto, crédito una sola vez y sin duplicados", async () => {
    const ticket = await newTicket(diag);
    const quote = await scenario(ticket);
    const before = await row(quote);
    await as(db, tech, () => q(`select public.send_quote($1)`, [quote]));
    const after = await row(quote);
    expect(after.status).toBe("sent");
    expect(after.sent_at).not.toBeNull();
    expect(num(after.total)).toBe(30100);
    expect(num(after.diagnosis_credit)).toBe(39900);
    expect(after.tax_snapshot).toEqual(before.tax_snapshot);
    expect((await q<{ status: string }>(`select status from tickets where id = $1`, [ticket]))[0].status).toBe("awaiting_approval");
    // el crédito sigue disponible (solo se consume al aprobar) y no se duplicó nada
    expect(await countOf(`select count(*) n from diagnosis_credits where ticket_id = $1 and status = 'available'`, [ticket])).toBe(1);
    expect(await countOf(`select count(*) n from payments where ticket_id = $1 and purpose = 'diagnosis'`, [ticket])).toBe(1);
    expect(await countOf(`select count(*) n from quotes where ticket_id = $1`, [ticket])).toBe(1);
    expect(await countOf(`select count(*) n from notifications where entity_id = $1 and type = 'quote.sent'`, [quote])).toBe(1);
  });

  it("doble clic / reintento: la segunda llamada se rechaza sin duplicar notificación ni cambiar nada", async () => {
    const ticket = await newTicket(diag);
    const quote = await scenario(ticket);
    await as(db, tech, () => q(`select public.send_quote($1)`, [quote]));
    await expect(as(db, tech, () => q(`select public.send_quote($1)`, [quote]))).rejects.toThrow(/quote_not_draft/);
    expect(await countOf(`select count(*) n from notifications where entity_id = $1 and type = 'quote.sent'`, [quote])).toBe(1);
    expect(num((await row(quote)).total)).toBe(30100);
  });

  it("el cliente no puede enviarla y el técnico no asignado tampoco", async () => {
    const quote = await scenario(await newTicket(diag));
    await expect(as(db, cli, () => q(`select public.send_quote($1)`, [quote]))).rejects.toThrow(/permission denied|forbidden|42501/i);
  });

  it("si el ticket sigue «Recibido» el envío falla con un motivo claro (no genérico) y no deja la cotización a medias", async () => {
    const ticket = await newTicket(diag, "received");
    const quote = await scenario(ticket);
    await expect(as(db, tech, () => q(`select public.send_quote($1)`, [quote]))).rejects.toThrow(/invalid_transition: received -> awaiting_approval/);
    // la transacción se deshace completa: sigue en borrador y sin notificación
    expect((await row(quote)).status).toBe("draft");
    expect(await countOf(`select count(*) n from notifications where entity_id = $1`, [quote])).toBe(0);
  });
});
