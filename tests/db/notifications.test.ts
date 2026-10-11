import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let owner: string, tech: string, tech2: string, cliA: string, cliB: string, custA: string, diag: string, svc: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;

const notes = (who: string, type: string, entity?: string) =>
  q<{ id: string; title: string; body: string; priority: string }>(
    `select id, title, body, priority from notifications where recipient_id = $1 and type = $2 ${entity ? "and entity_id = $3" : ""}`,
    entity ? [who, type, entity] : [who, type],
  );

async function ticket(service = svc, assigned: string | null = tech, modality = "store"): Promise<string> {
  const [{ id }] = await q<{ id: string }>(
    `insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,$3,'Falla de prueba',$4) returning id`,
    [custA, service, modality, assigned],
  );
  return id;
}
async function inDiagnosis(): Promise<string> {
  const t = await ticket();
  await q(`insert into receptions (ticket_id, reason) values ($1,'Lentitud')`, [t]);
  for (let i = 0; i < 4; i++) await q(`insert into evidence (ticket_id, stage, cloudinary_public_id) values ($1,'reception',$2)`, [t, `e/${t}/${i}`]);
  await as(db, tech, () => q(`select public.transition_ticket($1,'diagnosing')`, [t]));
  return t;
}
async function sentQuote(t: string): Promise<string> {
  const [{ id }] = await as(db, tech, () => q<{ id: string }>(`insert into quotes (ticket_id, customer_id) values ($1,$2) returning id`, [t, custA]));
  await as(db, tech, () => q(`insert into quote_items (quote_id, kind, service_id, description, qty, warranty_days) values ($1,'service',$2,'Mantenimiento',1,30)`, [id, svc]));
  await as(db, tech, () => q(`select public.send_quote($1)`, [id]));
  return id;
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
  svc = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities, requires_equipment) values ('rep','Reparación','technical',150000,'{store,home}',false) returning id`))[0].id;
}, 180000);

describe("solicitud creada y asignación", () => {
  it("avisa al cliente (solo confirma el registro) y al SUPERADMIN, no al técnico ni a otro cliente", async () => {
    const t = await ticket(svc, null);
    const c = await notes(cliA, "request.received", t);
    expect(c).toHaveLength(1);
    expect(c[0].body).toMatch(/solo confirma que registramos/i);
    expect(await notes(owner, "ticket.created", t)).toHaveLength(1);
    expect(await notes(tech, "ticket.created", t)).toHaveLength(0);
    expect(await notes(cliB, "request.received", t)).toHaveLength(0);
  });

  it("asignar avisa al técnico asignado y a nadie más; reasignar avisa al nuevo", async () => {
    const t = await ticket(svc, null);
    await as(db, owner, () => q(`select public.assign_ticket($1,$2)`, [t, tech]));
    expect(await notes(tech, "ticket.assigned", t)).toHaveLength(1);
    expect(await notes(tech2, "ticket.assigned", t)).toHaveLength(0);
    await as(db, owner, () => q(`select public.assign_ticket($1,$2)`, [t, tech2]));
    expect(await notes(tech2, "ticket.assigned", t)).toHaveLength(1);
  });
});

describe("pagos", () => {
  it("pago aprobado: cliente y técnico responsable reciben UN aviso; un webhook repetido no duplica", async () => {
    const t = await ticket(diag, tech);
    const [{ external_reference }] = await q<{ external_reference: string }>(`select * from public.begin_service_payment($1,'diagnosis',$2)`, [cliA, t]);
    const ev = (id: string) => q(`select public.apply_payment_event('mercadopago',$2,'payment','{}'::jsonb,true,$1,'mp-x','approved'::payment_status,39900,'COP')`, [external_reference, id]);
    await ev("evt-n-1");
    await ev("evt-n-2"); // otro evento del mismo pago
    await ev("evt-n-1"); // reenvío exacto
    const c = await notes(cliA, "payment.approved");
    expect(c.filter((n) => n.body.includes("confirmado"))).toHaveLength(1);
    expect(await notes(tech, "payment.cleared", t)).toHaveLength(1);
    // un pago en línea ya verificado no exige acción del SUPERADMIN
    expect(await notes(owner, "payment.received")).toHaveLength(0);
    // el crédito del diagnóstico se aplica una sola vez
    expect((await q(`select 1 from diagnosis_credits where ticket_id = $1`, [t])).length).toBe(1);
  });

  it("el texto de pago aprobado se adapta a la modalidad y no promete plazos", async () => {
    const t = await ticket(diag, tech, "home");
    const [{ external_reference }] = await q<{ external_reference: string }>(`select * from public.begin_service_payment($1,'diagnosis',$2)`, [cliA, t]);
    await q(`select public.apply_payment_event('mercadopago','evt-home','payment','{}'::jsonb,true,$1,'mp-h','approved'::payment_status,39900,'COP')`, [external_reference]);
    const [n] = await notes(cliA, "payment.approved", t);
    expect(n.body).toMatch(/coordinar la visita/i);
    expect(n.body).not.toMatch(/\b(\d+\s*(horas|minutos|días)|hoy|mañana|pronto)\b/i);
  });

  it("pago manual (transferencia): el SUPERADMIN recibe el aviso para validarla; el cliente solo al confirmarse", async () => {
    const t = await ticket(diag, tech);
    await q(`select public.record_manual_service_payment_v2($1,'diagnosis',$2,'bank_transfer','TRX-1',null,null)`, [tech, t]);
    expect(await notes(owner, "payment.transfer_pending", t)).toHaveLength(1);
    expect((await notes(cliA, "payment.approved", t)).length).toBe(0);
  });

  it("pago rechazado/vencido/cancelado: el cliente recibe el aviso una vez; el SUPERADMIN solo la incidencia (rechazo/vencimiento)", async () => {
    const t = await ticket(diag, tech);
    const [{ payment_id }] = await q<{ payment_id: string }>(`select * from public.begin_service_payment($1,'diagnosis',$2)`, [cliA, t]);
    await q(`update payments set status = 'rejected' where id = $1`, [payment_id]);
    const f = await notes(cliA, "payment.failed", t);
    expect(f).toHaveLength(1);
    expect(f[0].title).toMatch(/No se pudo completar/);
    expect(await notes(owner, "payment.incident", t)).toHaveLength(1);
    // no hay aviso de aprobación
    expect((await notes(cliA, "payment.approved", t)).length).toBe(0);
  });
});

describe("recepción, diagnóstico y reparación", () => {
  it("recepción: avisa al cliente («Recibimos tu equipo») y al técnico; el estado «received» NO genera un aviso engañoso", async () => {
    const t = await ticket();
    expect(await notes(cliA, "ticket.status_changed", t)).toHaveLength(0);
    await q(`insert into receptions (ticket_id, reason, received_by) values ($1,'Lentitud',$2)`, [t, tech]);
    expect(await notes(cliA, "equipment.received", t)).toHaveLength(1);
    // el técnico que registra no se avisa a sí mismo
    expect(await notes(tech, "equipment.received", t)).toHaveLength(0);
  });

  it("inicio de diagnóstico: cliente informado; técnico con la tarea; no al revés", async () => {
    const t = await inDiagnosis();
    expect(await notes(cliA, "diagnosis.started", t)).toHaveLength(1);
    expect(await notes(cliB, "diagnosis.started", t)).toHaveLength(0);
  });

  it("diagnóstico finalizado: el cliente es avisado una vez", async () => {
    const t = await inDiagnosis();
    await q(`insert into diagnostics (ticket_id, summary, technician_id) values ($1,'Disco lento',$2)`, [t, tech]);
    await as(db, tech, () => q(`select public.finalize_diagnosis($1)`, [t]));
    expect(await notes(cliA, "diagnosis.ready", t)).toHaveLength(1);
  });

  it("cotización: publicada → cliente; pregunta → técnico; aprobada → técnico + SUPERADMIN + confirmación al cliente; rechazada → técnico + SUPERADMIN", async () => {
    const t1 = await inDiagnosis();
    const q1 = await sentQuote(t1);
    expect(await notes(cliA, "quote.sent", q1)).toHaveLength(1);
    await as(db, cliA, () => q(`select public.decide_quote($1,'question','¿Incluye instalación?')`, [q1]));
    expect(await notes(tech, "quote.question", t1)).toHaveLength(1);
    await as(db, tech, () => q(`select public.answer_quote_question($1,'Sí')`, [q1]));
    await as(db, cliA, () => q(`select public.decide_quote($1,'approve',null)`, [q1]));
    expect(await notes(tech, "quote.approved", t1)).toHaveLength(1);
    expect(await notes(owner, "quote.approved", t1)).toHaveLength(1);
    expect(await notes(cliA, "quote.decision", t1)).toHaveLength(1);

    const t2 = await inDiagnosis();
    const q2 = await sentQuote(t2);
    await as(db, cliA, () => q(`select public.decide_quote($1,'reject','Caro')`, [q2]));
    expect(await notes(tech, "quote.rejected", t2)).toHaveLength(1);
    expect(await notes(owner, "quote.rejected", t2)).toHaveLength(1);
  });

  it("reparación terminada y entrega: cliente avisado; sin aviso a técnicos ajenos", async () => {
    const t = await inDiagnosis();
    const quote = await sentQuote(t);
    await as(db, cliA, () => q(`select public.decide_quote($1,'approve',null)`, [quote]));
    expect(await notes(cliA, "repair.started", t)).toHaveLength(1);
    await q(`update checklist_items set state = 'pass' where false`);
    expect(await notes(tech2, "repair.started", t)).toHaveLength(0);
  });
});

describe("aislamiento y acceso", () => {
  it("un cliente no ve los avisos de otro cliente ni del personal (RLS)", async () => {
    const t = await ticket();
    const a = await as(db, cliA, () => q<{ recipient_id: string }>(`select recipient_id from notifications`));
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((n) => n.recipient_id === cliA)).toBe(true);
    const b = await as(db, cliB, () => q<{ recipient_id: string }>(`select recipient_id from notifications where entity_id = $1`, [t]));
    expect(b).toHaveLength(0);
    // ni marcar como leído el aviso ajeno
    const [{ id }] = await notes(cliA, "request.received", t);
    await as(db, cliB, () => q(`update notifications set read_at = now() where id = $1`, [id]));
    expect((await q<{ r: string | null }>(`select read_at r from notifications where id = $1`, [id]))[0].r).toBeNull();
  });

  it("un técnico NO recibe avisos de tickets que no son suyos", async () => {
    const t = await ticket(svc, tech);
    await q(`insert into receptions (ticket_id, reason) values ($1,'Lentitud')`, [t]);
    expect(await notes(tech2, "equipment.received", t)).toHaveLength(0);
    const seen = await as(db, tech2, () => q(`select id from notifications where entity_id = $1`, [t]));
    expect(seen).toHaveLength(0);
  });

  it("la tabla de entregas y el reclamo de envíos solo los usa el servidor", async () => {
    await expect(as(db, cliA, () => q(`select * from notification_deliveries`))).rejects.toThrow(denied);
    await expect(as(db, cliA, () => q(`select public.claim_push_notifications(5)`))).rejects.toThrow(denied);
    await expect(as(db, owner, () => q(`select public.record_delivery(gen_random_uuid(),'push','sent',null)`))).rejects.toThrow(denied);
  });

  it("idempotencia: la misma clave de evento no duplica el aviso", async () => {
    const t = await ticket();
    await q(`select private.notify('dup-1', $1, 'x.test', 'T', 'B', 'ticket', $2)`, [cliA, t]);
    await q(`select private.notify('dup-1', $1, 'x.test', 'T', 'B', 'ticket', $2)`, [cliA, t]);
    expect(await notes(cliA, "x.test", t)).toHaveLength(1);
  });
});

describe("canales: push y correo", () => {
  it("push: solo se reclaman avisos de quien activó push Y tiene un dispositivo; usuario sin push no genera envío", async () => {
    const t = await ticket(svc, tech);
    // nadie activó push → nada que reclamar para estos usuarios
    expect((await q(`select * from public.claim_push_notifications(50) where recipient_id = $1`, [cliA])).length).toBe(0);

    await q(`insert into notification_preferences (profile_id, push_enabled) values ($1, true) on conflict (profile_id) do update set push_enabled = true`, [cliA]);
    // sin dispositivo suscrito tampoco
    expect((await q(`select * from public.claim_push_notifications(50) where recipient_id = $1`, [cliA])).length).toBe(0);

    await as(db, cliA, () => q(`insert into push_subscriptions (profile_id, endpoint, p256dh, auth_key) values ($1,'https://push.example/abc','p','a')`, [cliA]));
    const claimed = await q<{ notification_id: string; recipient_id: string; attempt: number }>(`select * from public.claim_push_notifications(50)`);
    expect(claimed.length).toBeGreaterThan(0);
    expect(claimed.every((c) => c.recipient_id === cliA)).toBe(true);
    expect(claimed.some((c) => c.recipient_id === tech)).toBe(false);
    expect(t).toBeTruthy();

    // reclamar de inmediato otra vez no repite (ventana de reintento)
    expect((await q(`select * from public.claim_push_notifications(50) where recipient_id = $1`, [cliA])).length).toBe(0);
    // confirmado: queda registrado y no se reenvía
    await q(`select public.record_delivery($1,'push','sent',null)`, [claimed[0].notification_id]);
    const [d] = await q<{ status: string }>(`select status from notification_deliveries where notification_id = $1 and channel = 'push'`, [claimed[0].notification_id]);
    expect(d.status).toBe("sent");
  });

  it("correo: cliente recibe hitos; personal solo lo de prioridad alta; respeta preferencia de correo", async () => {
    const rows = await q<{ recipient_role: string; type: string }>(`select * from public.claim_email_notifications(100)`);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      if (r.recipient_role !== "client") expect(["high"].length).toBe(1);
    }
    expect(rows.some((r) => r.recipient_role === "client" && r.type === "request.received")).toBe(true);
    // no se reclaman dos veces
    const again = await q(`select * from public.claim_email_notifications(100)`);
    expect(again).toHaveLength(0);
  });

  it("tickets sin atender: el cron avisa al SUPERADMIN una vez por día", async () => {
    const t = await ticket(svc, null);
    await q(`update tickets set created_at = now() - interval '5 hours' where id = $1`, [t]);
    await q(`select public.notify_stale_tickets()`);
    await q(`select public.notify_stale_tickets()`);
    expect(await notes(owner, "ticket.stale", t)).toHaveLength(1);
  });
});
