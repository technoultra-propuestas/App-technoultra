import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let admin: string, tech: string, cliA: string, cliB: string, custA: string, svc: string, prod: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;

/** Crea un ticket en diagnóstico asignado al técnico, con recepción y fotos obligatorias. */
async function ticketInDiagnosis(): Promise<string> {
  const [{ id }] = await q<{ id: string }>(
    `insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','Muy lento al encender',$3) returning id`,
    [custA, svc, tech],
  );
  await q(`insert into receptions (ticket_id, reason) values ($1,'Lentitud')`, [id]);
  for (let i = 0; i < 4; i++) await q(`insert into evidence (ticket_id, stage, cloudinary_public_id) values ($1,'reception',$2)`, [id, `e/${id}/${i}`]);
  await as(db, tech, () => q(`select public.transition_ticket($1,'diagnosing')`, [id]));
  return id;
}
async function draftQuote(ticket: string): Promise<string> {
  const [{ id }] = await as(db, tech, () => q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [ticket, custA]));
  await as(db, tech, () => q(`insert into quote_items (quote_id, kind, service_id, description, qty, warranty_days) values ($1,'service',$2,'Mantenimiento',1,30)`, [id, svc]));
  await as(db, tech, () => q(`insert into quote_items (quote_id, position, kind, product_id, description, qty, warranty_days, warranty_kind) values ($1,2,'product',$2,'SSD',1,365,'product')`, [id, prod]));
  return id;
}
const status = async (t: string) => (await q<{ s: string }>(`select status s from tickets where id = $1`, [t]))[0].s;
const qstatus = async (id: string) => (await q<{ s: string }>(`select status s from quotes where id = $1`, [id]))[0].s;

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, "admin@technoultra.com");
  await makeAdmin(db, admin);
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, admin, tech);
  cliA = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
  cliB = await createUser(db, "b@gmail.com", { full_name: "Cliente B" });
  custA = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliA]))[0].id;
  svc = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities) values ('mant','Mantenimiento','technical',70000,'{store}') returning id`))[0].id;
  prod = (await q<{ id: string }>(`insert into products (sku, slug, name, price) values ('SSD1','ssd','SSD',189000) returning id`))[0].id;
}, 180000);

describe("flujo de cotización", () => {
  it("el personal envía, el cliente pregunta, se responde y el cliente aprueba", async () => {
    const t = await ticketInDiagnosis();
    const quote = await draftQuote(t);
    await expect(as(db, cliA, () => q(`select public.send_quote($1)`, [quote]))).rejects.toThrow(denied);
    await as(db, tech, () => q(`select public.send_quote($1)`, [quote]));
    expect(await qstatus(quote)).toBe("sent");
    expect(await status(t)).toBe("awaiting_approval");
    expect((await q<{ d: string }>(`select valid_until::text d from quotes where id = $1`, [quote]))[0].d).toBeTruthy();

    // pregunta del cliente → aclaración
    await expect(as(db, cliA, () => q(`select public.decide_quote($1,'question',null)`, [quote]))).rejects.toThrow(/message_required/);
    await as(db, cliA, () => q(`select public.decide_quote($1,'question','¿Incluye instalación?')`, [quote]));
    expect(await qstatus(quote)).toBe("clarification");
    await expect(as(db, cliA, () => q(`select public.answer_quote_question($1,'sí')`, [quote]))).rejects.toThrow(denied);
    await as(db, tech, () => q(`select public.answer_quote_question($1,'Sí, incluye la instalación.')`, [quote]));
    expect(await qstatus(quote)).toBe("sent");

    // otro cliente no puede decidir sobre una cotización ajena
    await expect(as(db, cliB, () => q(`select public.decide_quote($1,'approve',null)`, [quote]))).rejects.toThrow(/quote_not_found|forbidden/);

    await as(db, cliA, () => q(`select public.decide_quote($1,'approve',null)`, [quote]));
    expect(await qstatus(quote)).toBe("approved");
    expect(await status(t)).toBe("in_service");
    // decisión definitiva: no se puede decidir de nuevo
    await expect(as(db, cliA, () => q(`select public.decide_quote($1,'reject',null)`, [quote]))).rejects.toThrow(/quote_not_open/);
    const events = await q<{ event_type: string }>(`select event_type from quote_events where quote_id = $1 order by id`, [quote]);
    expect(events.map((e) => e.event_type)).toEqual(["sent", "question", "answered", "approved"]);
    await expect(q(`update quote_events set message = 'x'`)).rejects.toThrow(/immutable/);
    // el personal recibió la notificación y el cliente también
    expect((await as(db, tech, () => q(`select id from notifications where type = 'quote.approved'`))).length).toBe(1);
    expect((await as(db, cliA, () => q(`select id from notifications where type = 'quote.sent'`))).length).toBe(1);
    // los precios quedan congelados: cambiar el catálogo no altera la cotización aprobada
    await q(`update products set price = 1 where id = $1`, [prod]);
    expect(Number((await q<{ t: string }>(`select total t from quotes where id = $1`, [quote]))[0].t)).toBe(70000 + 189000);
    await q(`update products set price = 189000 where id = $1`, [prod]);
  });

  it("el rechazo cancela el ticket con motivo y queda registrado", async () => {
    const t = await ticketInDiagnosis();
    const quote = await draftQuote(t);
    await as(db, tech, () => q(`select public.send_quote($1)`, [quote]));
    await as(db, cliA, () => q(`select public.decide_quote($1,'reject','Está muy caro')`, [quote]));
    expect(await qstatus(quote)).toBe("rejected");
    expect(await status(t)).toBe("cancelled");
    const [r] = await q<{ r: string }>(`select cancelled_reason r from tickets where id = $1`, [t]);
    expect(r.r).toContain("Está muy caro");
  });

  it("no se puede aprobar una cotización vencida ni un borrador", async () => {
    const t = await ticketInDiagnosis();
    const quote = await draftQuote(t);
    await expect(as(db, cliA, () => q(`select public.decide_quote($1,'approve',null)`, [quote]))).rejects.toThrow(/quote_not_found|quote_not_open/);
    await as(db, tech, () => q(`select public.send_quote($1)`, [quote]));
    await q(`update quotes set valid_until = current_date - 2 where id = $1`, [quote]);
    await expect(as(db, cliA, () => q(`select public.decide_quote($1,'approve',null)`, [quote]))).rejects.toThrow(/quote_expired/);
    expect(await status(t)).toBe("awaiting_approval");
  });

  it("no se envía una cotización vacía; el cliente no ve borradores", async () => {
    const t = await ticketInDiagnosis();
    const [{ id }] = await as(db, tech, () => q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [t, custA]));
    await expect(as(db, tech, () => q(`select public.send_quote($1)`, [id]))).rejects.toThrow(/quote_empty/);
    expect((await as(db, cliA, () => q(`select id from quotes where id = $1`, [id]))).length).toBe(0);
  });

  it("la revisión crea una nueva versión con los precios originales y reabre el diagnóstico", async () => {
    const t = await ticketInDiagnosis();
    const quote = await draftQuote(t);
    await as(db, tech, () => q(`select public.send_quote($1)`, [quote]));
    await q(`update products set price = 250000 where id = $1`, [prod]);
    const [{ v }] = await as(db, tech, () => q<{ v: string }>(`select public.revise_quote($1) v`, [quote]));
    expect(await qstatus(quote)).toBe("superseded");
    expect(await qstatus(v)).toBe("draft");
    expect(await status(t)).toBe("diagnosing");
    expect(Number((await q<{ t: string }>(`select total t from quotes where id = $1`, [v]))[0].t)).toBe(70000 + 189000);
    expect((await q<{ n: number }>(`select version n from quotes where id = $1`, [v]))[0].n).toBe(2);
    await q(`update products set price = 189000 where id = $1`, [prod]);
  });

  it("la aprobación presencial la registra el personal y queda auditada", async () => {
    const t = await ticketInDiagnosis();
    const quote = await draftQuote(t);
    await as(db, tech, () => q(`select public.send_quote($1)`, [quote]));
    await expect(as(db, cliA, () => q(`select public.record_in_person_approval($1)`, [quote]))).rejects.toThrow(denied);
    await as(db, tech, () => q(`select public.record_in_person_approval($1)`, [quote]));
    expect(await status(t)).toBe("in_service");
    expect((await q(`select 1 from audit_logs where action = 'quote.approved_in_person' and entity_id = $1`, [quote])).length).toBe(1);
  });

  it("un técnico no asignado no puede enviar ni revisar cotizaciones ajenas", async () => {
    const t = await ticketInDiagnosis();
    const quote = await draftQuote(t);
    const other = await createUser(db, "tec2@technoultra.com");
    await makeTechnician(db, admin, other);
    await expect(as(db, other, () => q(`select public.send_quote($1)`, [quote]))).rejects.toThrow(denied);
    await as(db, admin, () => q(`select public.send_quote($1)`, [quote]));
    await expect(as(db, other, () => q(`select public.revise_quote($1)`, [quote]))).rejects.toThrow(denied);
  });
});

describe("checklist y revisión de IA", () => {
  it("el checklist se crea desde la plantilla y solo se completa con pruebas obligatorias aprobadas", async () => {
    const t = await ticketInDiagnosis();
    const quote = await draftQuote(t);
    await as(db, tech, () => q(`select public.send_quote($1)`, [quote]));
    await as(db, cliA, () => q(`select public.decide_quote($1,'approve',null)`, [quote]));
    await as(db, tech, () => q(`select public.transition_ticket($1,'testing')`, [t]));
    const [{ r }] = await as(db, tech, () => q<{ r: string }>(`select public.start_checklist($1) r`, [t]));
    expect((await q<{ n: number }>(`select count(*)::int n from checklist_items where run_id = $1`, [r]))[0].n).toBe(18);
    // idempotente
    const [{ r: again }] = await as(db, tech, () => q<{ r: string }>(`select public.start_checklist($1) r`, [t]));
    expect(again).toBe(r);
    await expect(as(db, tech, () => q(`select public.complete_checklist($1)`, [r]))).rejects.toThrow(/checklist_incomplete/);
    await expect(as(db, cliA, () => q(`select public.start_checklist($1)`, [t]))).rejects.toThrow(denied);
    await as(db, tech, () => q(`update checklist_items set state = 'pass' where run_id = $1`, [r]));
    await as(db, tech, () => q(`select public.complete_checklist($1)`, [r]));
    await as(db, tech, () => q(`select public.transition_ticket($1,'ready')`, [t]));
    expect(await status(t)).toBe("ready");
  });

  it("el diagnóstico de IA nace preliminar y solo el personal asignado lo revisa", async () => {
    const t = await ticketInDiagnosis();
    const [{ id }] = await q<{ id: string }>(
      `insert into ai_diagnostics (customer_id, ticket_id, model, prompt_version, input, output, disclaimer)
       values ($1,$2,'gemini','v1','{}','{}','Diagnóstico preliminar generado con asistencia de IA. La recomendación está sujeta a verificación técnica presencial.') returning id`,
      [custA, t],
    );
    await expect(q(`update ai_diagnostics set is_preliminary = false where id = $1`, [id])).rejects.toThrow(/check/i);
    await expect(as(db, cliA, () => q(`select public.review_ai_diagnostic($1,'validated')`, [id]))).rejects.toThrow(denied);
    await as(db, tech, () => q(`select public.review_ai_diagnostic($1,'validated')`, [id]));
    const [row] = await q<{ validation_status: string; validated_by: string }>(`select validation_status, validated_by from ai_diagnostics where id = $1`, [id]);
    expect(row.validation_status).toBe("validated");
    expect(row.validated_by).toBe(tech);
  });
});

describe("documentos: vista, rechazo y numeración", () => {
  const hash = "d".repeat(64);
  it("solo el servidor numera documentos; el dueño marca visto y puede rechazar; otro cliente no", async () => {
    await expect(as(db, cliA, () => q(`select public.next_document_code()`))).rejects.toThrow(denied);
    const [{ c }] = await q<{ c: string }>(`select public.next_document_code() c`);
    expect(c).toMatch(/^DOC-\d{4}-\d{5}$/);
    const [{ id }] = await q<{ id: string }>(`insert into documents (code, doc_type, title, customer_id, storage_path, sha256) values ($1,'quote','Cotización',$2,'p.pdf',$3) returning id`, [c, custA, hash]);
    await as(db, cliB, () => q(`select public.mark_document_viewed($1)`, [id]));
    expect((await q<{ s: string }>(`select status s from documents where id = $1`, [id]))[0].s).toBe("generated");
    await as(db, cliA, () => q(`select public.mark_document_viewed($1)`, [id]));
    expect((await q<{ s: string }>(`select status s from documents where id = $1`, [id]))[0].s).toBe("viewed");
    await expect(as(db, cliB, () => q(`select public.reject_document($1)`, [id]))).rejects.toThrow(/document_not_rejectable/);
    await as(db, cliA, () => q(`select public.reject_document($1)`, [id]));
    expect((await q<{ s: string }>(`select status s from documents where id = $1`, [id]))[0].s).toBe("rejected");
    await expect(as(db, cliA, () => q(`select public.reject_document($1)`, [id]))).rejects.toThrow(/document_not_rejectable/);
  });
  it("una versión nueva reemplaza la anterior sin tocar un documento firmado", async () => {
    const [{ id: signed }] = await q<{ id: string }>(`insert into documents (doc_type, title, customer_id, storage_path, sha256) values ('delivery','Acta',$1,'a.pdf',$2) returning id`, [custA, hash]);
    await q(`insert into document_signatures (document_id, signer_profile_id, signer_name, consent_text, signature_ref, document_sha256) values ($1,$2,'Cliente A','Acepto el documento firmado v1','s.png',$3)`, [signed, cliA, hash]);
    await expect(q(`update documents set status = 'generated' where id = $1`, [signed])).rejects.toThrow(/signed_document_final/);
    await q(`update documents set status = 'superseded' where id = $1`, [signed]); // permitido: se conserva el original firmado
    expect((await q<{ s: string; h: string }>(`select status s, sha256 h from documents where id = $1`, [signed]))[0]).toEqual({ s: "superseded", h: hash });
  });
});

describe("ticket de mostrador creado por un técnico", () => {
  it("puede crear el cliente, su equipo y el ticket; no ve a otros clientes", async () => {
    const [{ id: c }] = await as(db, tech, () => q<{ id: string }>(`insert into customers (full_name, phone) values ('Cliente Mostrador','3105551234') returning id`));
    const [{ id: e }] = await as(db, tech, () => q<{ id: string }>(`insert into equipment (customer_id, type, brand, model) values ($1,'laptop','Acer','Aspire') returning id`, [c]));
    const [{ id: t }] = await as(db, tech, () => q<{ id: string }>(`insert into tickets (customer_id, equipment_id, modality, problem, assigned_to) values ($1,$2,'store','No enciende nunca',$3) returning id`, [c, e, tech]));
    expect(await status(t)).toBe("received");
    // otro cliente (con cuenta) sigue invisible para el técnico
    const [{ id: custB }] = await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliB]);
    expect((await as(db, tech, () => q(`select id from customers where id = $1`, [custB]))).length).toBe(0);
    // otro técnico no ve al cliente de mostrador de este técnico
    const other = await createUser(db, "tec3@technoultra.com");
    await makeTechnician(db, admin, other);
    expect((await as(db, other, () => q(`select id from customers where id = $1`, [c]))).length).toBe(0);
    expect((await as(db, other, () => q(`select id from equipment where id = $1`, [e]))).length).toBe(0);
    // el cliente de mostrador no puede asignarse a cuentas ajenas
    await expect(as(db, tech, () => q(`update customers set profile_id = $2 where id = $1`, [c, cliA]))).rejects.toThrow(denied);
  });
});
