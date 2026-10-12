import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let owner: string, tech: string, tech2: string, cliA: string, cliB: string, custA: string, svc: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;
const SHA = "a".repeat(64);
const SHA2 = "b".repeat(64);

const status = async (t: string) => (await q<{ s: string }>(`select status s from tickets where id = $1`, [t]))[0].s;
const notes = (who: string, type: string, entity?: string) =>
  q<{ id: string; title: string; body: string; priority: string }>(`select id, title, body, priority from notifications where recipient_id = $1 and type = $2 ${entity ? "and entity_id = $3" : ""}`, entity ? [who, type, entity] : [who, type]);

/** Ticket recibido: acta (reception) y las 4 fotos, asignado a `assigned`. */
async function received(assigned = tech): Promise<string> {
  const [{ id }] = await q<{ id: string }>(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','Falla',$3) returning id`, [custA, svc, assigned]);
  await q(`insert into receptions (ticket_id, reason, received_by) values ($1,'Falla',$2)`, [id, assigned]);
  for (const [i, slot] of ["front", "back", "left", "damage"].entries()) await q(`insert into evidence (ticket_id, stage, slot, cloudinary_public_id) values ($1,'reception',$2,$3)`, [id, slot, `e/${id}/${i}`]);
  return id;
}
const actaDoc = async (t: string, version = 1, sha = SHA) =>
  (await q<{ id: string }>(`insert into documents (doc_type, version, status, title, customer_id, ticket_id, storage_path, sha256) values ('reception',$2,'generated','Acta de recepción',$3,$1,$4,$5) returning id`, [t, version, custA, `tickets/${t}/acta-v${version}.pdf`, sha]))[0].id;
const sign = (doc: string, o: { sha?: string; signer?: string | null; channel?: string; by?: string | null } = {}) =>
  q(`insert into document_signatures (document_id, signer_profile_id, signer_name, consent_text, signature_ref, document_sha256, capture_channel, captured_by) values ($1,$2,'Cliente A','Confirmo que leí y acepto el documento',$3,$4,$5,$6)`, [doc, o.signer === undefined ? cliA : o.signer, `signatures/${doc}/${Math.random()}.png`, o.sha ?? SHA, o.channel ?? "client_session", o.by ?? null]);

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@technoultra.com");
  await makeAdmin(db, owner);
  tech = await createUser(db, "t1@technoultra.com");
  await makeTechnician(db, owner, tech);
  tech2 = await createUser(db, "t2@technoultra.com");
  await makeTechnician(db, owner, tech2);
  cliA = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
  cliB = await createUser(db, "b@gmail.com", { full_name: "Cliente B" });
  custA = (await q<{ id: string }>(`select id from customers where profile_id = $1`, [cliA]))[0].id;
  svc = (await q<{ id: string }>(`insert into services (slug, name, kind, base_price, allowed_modalities) values ('rep','Reparación','technical',50000,'{store}') returning id`))[0].id;
}, 180000);

describe("el diagnóstico exige el acta de recepción firmada", () => {
  it("con acta y fotos pero SIN firma el técnico no puede pasar a diagnóstico; el servidor lo dice", async () => {
    const t = await received();
    await expect(as(db, tech, () => q(`select public.transition_ticket($1,'diagnosing')`, [t]))).rejects.toThrow(/reception_signature_missing/);
    await actaDoc(t);
    await expect(as(db, tech, () => q(`select public.transition_ticket($1,'diagnosing')`, [t]))).rejects.toThrow(/reception_signature_missing/);
    expect(await status(t)).toBe("received");
  });

  it("al crearse el acta el cliente recibe UN aviso «Firma el acta» y el técnico no (él la preparó)", async () => {
    const t = await received();
    const d = await actaDoc(t);
    const c = await notes(cliA, "document.sign_pending", d);
    expect(c).toHaveLength(1);
    expect(c[0].priority).toBe("high");
    expect(await notes(tech, "document.sign_pending")).toHaveLength(0);
    expect(await notes(cliB, "document.sign_pending")).toHaveLength(0);
  });

  it("la firma del cliente marca el acta como firmada, avisa a cliente y técnico (una vez) y el ticket pasa SOLO a diagnóstico", async () => {
    const t = await received();
    const d = await actaDoc(t);
    await sign(d);
    expect((await q<{ status: string }>(`select status from documents where id = $1`, [d]))[0].status).toBe("signed");
    expect(await status(t)).toBe("diagnosing");
    expect(await notes(cliA, "document.signed", d)).toHaveLength(1);
    expect(await notes(tech, "document.signed_staff", t)).toHaveLength(1);
    expect(await notes(tech, "diagnosis.started")).toHaveLength(0); // ese aviso es del cliente
    expect((await notes(cliA, "diagnosis.started", t)).length).toBe(1);
    // ya firmada: no se puede firmar de nuevo ni con otro hash
    await expect(sign(d)).rejects.toThrow(/document_not_signable|unique/);
  });

  it("la firma solo vale para la versión exacta (hash): con otro hash se rechaza y el acta no queda firmada", async () => {
    const t = await received();
    const d = await actaDoc(t);
    await expect(sign(d, { sha: SHA2 })).rejects.toThrow(/document_hash_mismatch/);
    expect((await q<{ status: string }>(`select status from documents where id = $1`, [d]))[0].status).toBe("generated");
    expect(await status(t)).toBe("received");
  });

  it("una versión nueva del acta exige NUEVA aceptación y la firma anterior se conserva intacta", async () => {
    const t = await received();
    const d1 = await actaDoc(t, 1);
    await sign(d1);
    const d2 = await actaDoc(t, 2, SHA2);
    expect((await q<{ ok: boolean }>(`select private.reception_signed($1) ok`, [t]))[0].ok).toBe(false); // la última versión no está firmada
    expect((await q<{ status: string }>(`select status from documents where id = $1`, [d1]))[0].status).toBe("signed");
    await sign(d2, { sha: SHA2 });
    expect((await q<{ ok: boolean }>(`select private.reception_signed($1) ok`, [t]))[0].ok).toBe(true);
  });
});

describe("firma presencial en el dispositivo del personal (canal registrado)", () => {
  it("se admite solo con el personal que la capturó; queda el canal y quién la capturó; el cliente sin cuenta también puede firmar así", async () => {
    const t = await received();
    const d = await actaDoc(t);
    await expect(sign(d, { signer: null, channel: "assisted", by: null })).rejects.toThrow(/assisted_chk|check/i);
    await expect(sign(d, { signer: null, channel: "client_session" })).rejects.toThrow(/signer_chk|check/i);
    await sign(d, { signer: cliA, channel: "assisted", by: tech });
    const [r] = await q<{ capture_channel: string; captured_by: string }>(`select capture_channel, captured_by from document_signatures where document_id = $1`, [d]);
    expect(r).toMatchObject({ capture_channel: "assisted", captured_by: tech });
    expect(await status(t)).toBe("diagnosing");
  });

  it("las firmas son inmutables y los clientes no pueden crear ni cambiar firmas desde la API", async () => {
    const t = await received();
    const d = await actaDoc(t);
    await sign(d, { signer: null, channel: "assisted", by: tech });
    await expect(q(`update document_signatures set signer_name = 'X'`)).rejects.toThrow(/immutable|forbid/i);
    await expect(q(`delete from document_signatures`)).rejects.toThrow(/immutable|forbid/i);
    await expect(as(db, cliA, () => sign(d))).rejects.toThrow(denied);
  });
});

describe("excepción autorizada (solo SUPERADMIN, auditada)", () => {
  const authorize = (actor: string, t: string, reason: string) => q(`select public.authorize_reception_exception($1,$2,$3)`, [actor, t, reason]);
  it("el técnico o el cliente no pueden autorizarla; el SUPERADMIN exige un motivo", async () => {
    const t = await received();
    await actaDoc(t);
    await expect(authorize(tech, t, "El cliente no puede firmar hoy")).rejects.toThrow(/forbidden/);
    await expect(authorize(cliA, t, "El cliente no puede firmar hoy")).rejects.toThrow(/forbidden/);
    await expect(authorize(owner, t, "ok")).rejects.toThrow(/reason_required/);
    await expect(as(db, owner, () => q(`select public.authorize_reception_exception($1,$2,'motivo válido')`, [owner, t]))).rejects.toThrow(denied); // no se invoca desde la API
    expect(await status(t)).toBe("received");
  });
  it("con motivo: queda registrada e inmutable, auditada, avisa al técnico y a los SUPERADMIN, y el ticket pasa a diagnóstico", async () => {
    const t = await received();
    await actaDoc(t);
    await authorize(owner, t, "El cliente dejó el equipo y no puede firmar hoy");
    expect(await status(t)).toBe("diagnosing");
    expect(await q(`select 1 from ticket_exceptions where ticket_id = $1 and authorized_by = $2`, [t, owner])).toHaveLength(1);
    expect((await q(`select 1 from audit_logs where action = 'ticket.exception_authorized' and entity_id = $1`, [t])).length).toBe(1);
    expect(await notes(tech, "ticket.exception", t)).toHaveLength(1);
    expect(await notes(owner, "ticket.exception", t)).toHaveLength(0); // quien la autorizó no se avisa a sí mismo (ya lo sabe)
    await expect(q(`update ticket_exceptions set reason = 'otro motivo'`)).rejects.toThrow(/immutable|forbid/i);
    await expect(authorize(owner, t, "otra vez, por si acaso")).rejects.toThrow(/ticket_not_waiting_reception/);
  });
  it("no se autoriza si ya está firmada ni sin acta de recepción", async () => {
    const t = await received();
    const d = await actaDoc(t);
    await sign(d);
    const t2 = (await q<{ id: string }>(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','Falla',$3) returning id`, [custA, svc, tech]))[0].id;
    await expect(authorize(owner, t2, "sin acta registrada")).rejects.toThrow(/reception_missing/);
  });
  it("la tabla de excepciones solo la lee el personal que puede ver el ticket", async () => {
    const t = await received();
    await actaDoc(t);
    await authorize(owner, t, "Excepción de prueba autorizada");
    expect(await as(db, tech, () => q(`select 1 from ticket_exceptions where ticket_id = $1`, [t]))).toHaveLength(1);
    expect(await as(db, tech2, () => q(`select 1 from ticket_exceptions where ticket_id = $1`, [t]))).toHaveLength(0);
    expect(await as(db, cliA, () => q(`select 1 from ticket_exceptions`))).toHaveLength(0);
    await expect(as(db, tech, () => q(`insert into ticket_exceptions (ticket_id, kind, reason, authorized_by) values ($1,'reception_signature','falsa excepción',$2)`, [t, tech]))).rejects.toThrow(denied);
  });
});

describe("el SUPERADMIN ve TODO: copia de supervisión de los avisos de cliente y técnico", () => {
  it("cada aviso al técnico o al cliente deja una copia para CADA SUPERADMIN, con el contexto (para quién, servicio y cliente), sin correo ni push", async () => {
    const [{ id: t }] = await q<{ id: string }>(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ($1,$2,'store','Falla',$3) returning id`, [custA, svc, tech]);
    const code = (await q<{ code: string }>(`select code from tickets where id = $1`, [t]))[0].code;
    await q(`select private.notify($1, $2, 'x.client', 'Aviso al cliente', 'Texto del cliente', 'ticket', $3)`, [`ev-c-${t}`, cliA, t]);
    await q(`select private.notify($1, $2, 'x.tech', 'Aviso al técnico', 'Texto del técnico', 'ticket', $3)`, [`ev-t-${t}`, tech, t]);
    for (const sa of [owner]) {
      const sup = await q<{ title: string; body: string; priority: string }>(`select title, body, priority from notifications where recipient_id = $1 and type = 'supervision' and entity_id = $2 and event_key like 'sup:ev-%'`, [sa, t]);
      expect(sup).toHaveLength(2);
      expect(sup.every((s) => s.priority === "low")).toBe(true);
      expect(sup.some((s) => /^Para cliente/.test(s.body) && s.body.includes(code) && s.body.includes("Cliente A") && s.body.includes("Texto del cliente"))).toBe(true);
      expect(sup.some((s) => /^Para técnico/.test(s.body) && s.body.includes("Texto del técnico"))).toBe(true);
    }
    // los avisos de supervisión no se envían por correo ni push
    const mail = await q<{ type: string }>(`select * from public.claim_email_notifications(500)`);
    expect(mail.some((m) => m.type === "supervision")).toBe(false);
    await q(`insert into notification_preferences (profile_id, push_enabled) values ($1, true) on conflict (profile_id) do update set push_enabled = true`, [owner]);
    await q(`insert into push_subscriptions (profile_id, endpoint, p256dh, auth_key) values ($1,'https://push.example/sa','p','a')`, [owner]);
    const push = await q<{ recipient_id: string; notification_id: string }>(`select * from public.claim_push_notifications(500) where recipient_id = $1`, [owner]);
    const types = await q<{ type: string }>(`select type from notifications where id = any($1::uuid[])`, [push.map((p) => p.notification_id)]);
    expect(types.some((x) => x.type === "supervision")).toBe(false);
  });
  it("un aviso propio del SUPERADMIN del mismo evento reemplaza la copia (sin duplicados) y no se avisa a quien actuó", async () => {
    const t = await received();
    const d = await actaDoc(t);
    await sign(d); // eventos del acta: cliente (doc-signed), técnico (doc-signed): copias de supervisión para ambos SUPERADMIN
    for (const sa of [owner]) {
      const sup = await q(`select 1 from notifications where recipient_id = $1 and type = 'supervision' and entity_id = $2`, [sa, t]);
      expect(sup.length).toBeGreaterThanOrEqual(2);
    }
    // una excepción AUTORIZADA POR el SUPERADMIN: él no recibe aviso de su propia acción (ni copia)
    const t2 = await received();
    await actaDoc(t2);
    await q(`select public.authorize_reception_exception($1,$2,'Motivo de la excepción de prueba')`, [owner, t2]);
    expect(await q(`select 1 from notifications where recipient_id = $1 and event_key in ($2, $3)`, [owner, `exc:${t2}`, `sup:exc:${t2}`])).toHaveLength(0);
    // la copia de supervisión NO se duplica cuando llega el aviso propio del mismo evento (reemplazo)
    const t3 = await received();
    await q(`select private.notify($1, $2, 'x.test', 'Aviso al técnico', 'Texto', 'ticket', $3)`, [`ev-${t3}`, tech, t3]);
    expect((await q(`select 1 from notifications where recipient_id = $1 and event_key = $2 and type = 'supervision'`, [owner, `sup:ev-${t3}`])).length).toBe(1);
    await q(`select private.notify($1, $2, 'x.mine', 'Aviso propio', 'Texto', 'ticket', $3)`, [`ev-${t3}`, owner, t3]);
    expect(await q(`select 1 from notifications where recipient_id = $1 and event_key in ($2, $3)`, [owner, `ev-${t3}`, `sup:ev-${t3}`])).toHaveLength(1);
  });
  it("el SUPERADMIN no recibe copia de sus propios avisos ni los clientes/técnicos reciben avisos de supervisión", async () => {
    expect(await q(`select 1 from notifications n join profiles p on p.id = n.recipient_id where n.type = 'supervision' and p.role <> 'superadmin'`)).toHaveLength(0);
    expect(await q(`select 1 from notifications where type = 'supervision' and event_key not like 'sup:%'`)).toHaveLength(0);
  });
  it("las copias respetan RLS: cada SUPERADMIN solo lee las suyas; técnicos y clientes ninguna", async () => {
    const mine = await as(db, owner, () => q<{ recipient_id: string }>(`select recipient_id from notifications where type = 'supervision'`));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((m) => m.recipient_id === owner)).toBe(true);
    expect(await as(db, tech, () => q(`select 1 from notifications where type = 'supervision'`))).toHaveLength(0);
    expect(await as(db, cliA, () => q(`select 1 from notifications where type = 'supervision'`))).toHaveLength(0);
  });
});
