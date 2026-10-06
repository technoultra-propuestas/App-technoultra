// Seguridad (Zero Trust) con sesiones REALES de Supabase Auth: escalada de privilegios, aislamiento entre clientes, MFA exigida por
// la base de datos y funciones sensibles inaccesibles desde el navegador. Ninguna comprobación depende de la interfaz.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sleep } from "../lib/browser.mjs";
import { createUser } from "../lib/fixtures.mjs";
import { randomPassword, stamp, totp } from "../lib/support.mjs";

export const title = "Seguridad: escalada de privilegios, aislamiento y MFA a nivel de base de datos";

const U = () => randomUUID();

export async function run({ rep, env, sb, state, save }) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const fresh = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = async ({ email, password }) => {
    const c = fresh();
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`login ${email}: ${error.message}`);
    return c;
  };
  /** Sube la sesión a AAL2 con el TOTP del usuario (como hace la pantalla de verificación). */
  const aal2 = async (c, secret) => {
    const { data: f } = await c.auth.mfa.listFactors();
    const factorId = f.totp.find((x) => x.status === "verified").id;
    for (const offset of [0, 1]) {
      const { error } = await c.auth.mfa.challengeAndVerify({ factorId, code: totp(secret, offset) });
      if (!error) return true;
      await sleep(31000);
    }
    return false;
  };
  const fails = (r) => Boolean(r.error) || (Array.isArray(r.data) && r.data.length === 0);

  // ---- otro cliente (B) para probar aislamiento
  if (!state.clientB) {
    const s = stamp();
    state.clientB = { email: `cliente-b-${s}@e2e.technoultra.test`, password: randomPassword(), fullName: "Cliente B E2E" };
    await createUser(sb, state.clientB);
    save();
  }
  const ticketId = state.flow?.ticketId;
  const quoteId = state.flow?.quoteId;
  const A = await login(state.client);
  const B = await login(state.clientB);

  // ---- 1. un cliente no puede ascender ni tocar datos ajenos
  const me = (await A.auth.getUser()).data.user.id;
  const up = await A.from("profiles").update({ role: "superadmin" }).eq("id", me).select();
  const role = (await sb.from("profiles").select("role").eq("id", me).single()).data.role;
  rep.check("un cliente NO puede cambiarse el rol a superadmin (queda como client)", role === "client" && fails(up), `${up.error?.code ?? "0 filas"} / rol=${role}`);
  const a2 = await A.from("profiles").update({ is_active: false, email: "x@x.com" }).eq("id", me).select();
  rep.check("ni cambiar su correo/estado de cuenta por la API", fails(a2));

  // ---- 2. aislamiento entre clientes
  for (const t of ["tickets", "quotes", "payments", "documents", "evidence", "warranties", "service_requests", "equipment", "customers"]) {
    const own = await A.from(t).select("id").limit(5);
    const other = await B.from(t).select("id").limit(5);
    const aIds = new Set((own.data ?? []).map((r) => r.id));
    const leaked = (other.data ?? []).filter((r) => aIds.has(r.id)).length;
    rep.check(`aislamiento en «${t}»: A ve lo suyo (${aIds.size}) y B no ve nada de A`, aIds.size > 0 && leaked === 0 && !other.error, other.error?.message ?? `filtradas ${leaked}`);
  }
  const steal = await B.from("tickets").update({ status: "cancelled" }).eq("id", ticketId).select();
  rep.check("el cliente B no puede modificar el ticket del cliente A", fails(steal));

  // ---- 3. escrituras directas prohibidas (todo pasa por funciones del servidor)
  const bad = [
    ["insertar un pago a su favor", () => A.from("payments").insert({ code: "X", customer_id: U(), provider: "manual", method: "cash", status: "approved", amount: 1, purpose: "quote" })],
    ["modificar el total de su cotización", () => A.from("quotes").update({ total: 1 }).eq("id", quoteId).select()],
    ["modificar el estado de su pago", () => A.from("payments").update({ status: "approved" }).eq("ticket_id", ticketId).select()],
    ["crear un ticket directamente", () => A.from("tickets").insert({ customer_id: U(), modality: "store", problem: "x" })],
    ["borrar la auditoría", () => A.from("audit_logs").delete().gte("id", 0).select()],
    ["escribir ajustes del negocio", () => A.from("app_settings").update({ value: "1" }).eq("key", "business.phone").select()],
    ["publicar un documento legal", () => A.from("legal_documents").update({ status: "published" }).neq("id", U()).select()],
  ];
  for (const [what, fn] of bad) {
    const r = await fn();
    rep.check(`un cliente no puede ${what}`, fails(r), r.error?.code ?? "sin filas");
  }

  // ---- 4. funciones sensibles: ningún cliente las puede ejecutar
  const sensitive = [
    ["bootstrap_first_superadmin", { p_user_id: me }],
    ["admin_provision_staff", { p_actor: me, p_user_id: me, p_role: "technician", p_full_name: "x" }],
    ["admin_set_user_active", { p_actor: me, p_user_id: U(), p_active: false }],
    ["begin_service_payment", { p_actor: me, p_kind: "quote", p_ref: U() }],
    ["record_manual_service_payment", { p_actor: me, p_kind: "quote", p_ref: U(), p_method: "cash" }],
    ["apply_payment_event", { p_external_reference: "x", p_external_id: "1", p_status: "approved", p_amount: 1, p_currency: "COP", p_signature_valid: true, p_payload: {} }],
    ["anonymize_customer", { p_customer: U() }],
    ["publish_legal_document", { p_id: U() }],
    ["transition_ticket", { p_ticket: ticketId, p_to: "cancelled", p_reason: "x" }],
    ["assign_ticket", { p_ticket: ticketId, p_staff: me }],
    ["send_quote", { p_quote: quoteId }],
    ["record_manual_payment", { p_order: U(), p_method: "cash" }],
  ];
  for (const [fn, args] of sensitive) {
    const r = await A.rpc(fn, args);
    rep.check(`rpc ${fn} rechazada para un cliente`, Boolean(r.error), r.error?.code ?? "¡se ejecutó!");
  }

  // ---- 5. anónimo
  const anon = fresh();
  for (const t of ["tickets", "payments", "profiles", "customers", "quotes", "audit_logs", "legal_documents_drafts"]) {
    const r = await anon.from(t).select("*").limit(1);
    rep.check(`anónimo no lee «${t}»`, (r.data ?? []).length === 0, r.error?.code ?? "vacío");
  }
  const pub = await anon.from("app_settings").select("key,is_public").limit(200);
  rep.check("anónimo solo lee ajustes públicos", !pub.error && (pub.data ?? []).every((x) => x.is_public), pub.error?.code ?? `${pub.data?.length} filas`);

  // ---- 6. MFA en la base de datos: con solo contraseña (AAL1) el personal NO actúa como personal
  const techA1 = await login(state.tech);
  const ownerA1 = await login(state.owner);
  const t1 = await techA1.from("tickets").select("id").limit(5);
  rep.check("el técnico sin MFA (AAL1) no ve tickets", (t1.data ?? []).length === 0, t1.error?.code ?? "vacío");
  const o1 = await ownerA1.from("app_settings").select("key").eq("is_public", false).limit(5);
  rep.check("el SUPERADMIN sin MFA (AAL1) no lee ajustes privados", (o1.data ?? []).length === 0, o1.error?.code ?? "vacío");
  const o1w = await ownerA1.from("app_settings").update({ value: "9999999" }).eq("key", "business.phone").select();
  rep.check("el SUPERADMIN sin MFA (AAL1) no escribe ajustes", fails(o1w));
  const o1t = await ownerA1.rpc("transition_ticket", { p_ticket: ticketId, p_to: "cancelled", p_reason: "x" });
  rep.check("el SUPERADMIN sin MFA (AAL1) no ejecuta acciones de personal", Boolean(o1t.error), o1t.error?.code);

  // ---- 7. con MFA (AAL2): los límites por rol siguen vigentes
  const tech = await login(state.tech);
  rep.check("el técnico sube a AAL2 con su TOTP", await aal2(tech, state.tech.secret));
  const tt = await tech.from("tickets").select("id").limit(5);
  rep.check("el técnico con MFA ve los tickets que le asignaron", (tt.data ?? []).length >= 1, `${tt.data?.length}`);
  const techBad = [
    ["escribir ajustes del negocio", () => tech.from("app_settings").update({ value: "1" }).eq("key", "business.phone").select()],
    ["cambiar el estado de un ticket por la tabla", () => tech.from("tickets").update({ status: "cancelled" }).eq("id", ticketId).select()],
    ["editar un pago", () => tech.from("payments").update({ amount: 1 }).eq("ticket_id", ticketId).select()],
    ["ascender a alguien a superadmin", () => tech.from("profiles").update({ role: "superadmin" }).eq("id", me).select()],
  ];
  for (const [what, fn] of techBad) {
    const r = await fn();
    rep.check(`el técnico (AAL2) no puede ${what}`, fails(r), r.error?.code ?? "sin filas");
  }
  const techRpc = await tech.rpc("admin_provision_staff", { p_actor: state.techId, p_user_id: me, p_role: "technician", p_full_name: "x" });
  rep.check("el técnico (AAL2) no puede dar de alta personal", Boolean(techRpc.error), techRpc.error?.code);
  const techReg = await tech.rpc("record_manual_service_payment", { p_actor: state.techId, p_kind: "quote", p_ref: quoteId, p_method: "cash" });
  rep.check("el técnico no puede registrar pagos por la API (solo funciones del servidor)", Boolean(techReg.error), techReg.error?.code);

  const owner = await login(state.owner);
  rep.check("el SUPERADMIN sube a AAL2 con su TOTP", await aal2(owner, state.owner.secret));
  const o2 = await owner.from("app_settings").select("key").limit(3);
  rep.check("el SUPERADMIN con MFA lee los ajustes", (o2.data ?? []).length > 0, o2.error?.code);
  const second = await owner.rpc("admin_provision_staff", { p_actor: state.ownerId, p_user_id: state.techId, p_role: "superadmin", p_full_name: "x" });
  rep.check("ni el SUPERADMIN puede crear otro SUPERADMIN (propietario único)", Boolean(second.error), second.error?.message?.slice(0, 40));
  const self = await owner.from("profiles").update({ role: "technician" }).eq("id", state.ownerId).select();
  rep.check("nadie degrada al SUPERADMIN desde la API", fails(self) || (await sb.from("profiles").select("role").eq("id", state.ownerId).single()).data.role === "superadmin");
  const dup = await sb.from("profiles").update({ role: "superadmin" }).eq("id", state.techId);
  rep.check("la base de datos impide un segundo SUPERADMIN incluso con service_role", Boolean(dup.error), dup.error?.code);

  // ---- 8. inmutabilidad
  const aud = await owner.from("audit_logs").delete().gte("id", 0).select();
  rep.check("la auditoría no se puede borrar (ni siquiera el SUPERADMIN)", fails(aud));
  const audU = await owner.from("audit_logs").update({ action: "x" }).gte("id", 0).select();
  rep.check("la auditoría no se puede editar", fails(audU));
  const payU = await owner.from("payments").update({ amount: 1 }).eq("ticket_id", ticketId).select();
  rep.check("un pago registrado no se puede alterar", fails(payU));
  const histU = await owner.from("ticket_status_history").delete().eq("ticket_id", ticketId).select();
  rep.check("el historial de estados del ticket no se puede borrar", fails(histU));
}
