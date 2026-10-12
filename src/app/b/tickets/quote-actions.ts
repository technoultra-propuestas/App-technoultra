"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { generateTicketDocument } from "@/lib/documents/generate";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { scheduleEmailFlush } from "@/lib/email/outbox";
import { statusLabel } from "@/components/ui/layout";
import { reportActionError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";

const QUOTE_ERRORS: [RegExp, string][] = [
  [/forbidden|42501|row-level security/, "No tienes permiso para esta acción."],
  [/quote_empty/, "Agrega al menos un ítem antes de enviar."],
  [/quote_not_draft|quote_not_editable/, "Esta cotización ya no se puede editar. Crea una nueva versión."],
  [/quote_not_open/, "La cotización ya no está abierta."],
  [/quote_not_revisable/, "Solo se puede revisar una cotización enviada."],
  [/price_override_forbidden/, "El precio debe ser el del catálogo. Pide autorización a administración."],
  [/precondition_failed: quote_not_sent/, "Primero envía la cotización."],
  [/duplicate|23505/, "Ya existe una cotización abierta para este ticket."],
  [/urgency_unavailable/, "Ese nivel de urgencia no está disponible."],
  [/urgency_not_applicable/, "Ese nivel no aplica ahora (día, horario o modalidad)."],
  [/delivery_not_applicable/, "El domicilio solo aplica a servicios a domicilio."],
  [/delivery_address_missing/, "La solicitud no tiene dirección."],
  [/out_of_coverage/, "La dirección está fuera de cobertura."],
  [/diagnosis_already_paid/, "El diagnóstico de este ticket ya está pagado."],
  [/ticket_not_diagnosis/, "Este ticket no es de un servicio de diagnóstico."],
  [/diagnosis_credit_already_used/, "El abono del diagnóstico ya fue usado."],
  [/product_unavailable/, "Ese producto ya no está disponible en el catálogo."],
];
const GENERIC = "No pudimos completar la acción. Inténtalo de nuevo.";
/** Mensaje claro para el usuario según el error real; lo desconocido cae en el genérico (y se registra con referencia). */
const friendly = (m?: string) => {
  const t = m?.match(/invalid_transition: (\w+) -> awaiting_approval/);
  if (t) return `Para enviar la cotización el ticket debe estar «En diagnóstico» (ahora está «${statusLabel(t[1])}»). Cámbialo desde «Cambiar estado».`;
  return QUOTE_ERRORS.find(([re]) => m && re.test(m))?.[1] ?? GENERIC;
};
const uuid = z.string().uuid();
const refresh = (ticketId: string) => revalidatePath(`/b/tickets/${ticketId}`);

export async function createQuoteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["technician", "superadmin"]);
  const ticketId = uuid.safeParse(fd.get("ticketId"));
  if (!ticketId.success) return { ok: false, error: "Ticket no válido." };
  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("customer_id").eq("id", ticketId.data).maybeSingle();
  if (!t) return { ok: false, error: "Ticket no encontrado." };
  const { error } = await supabase.from("quotes").insert({ ticket_id: ticketId.data, customer_id: t.customer_id });
  if (error) return { ok: false, error: friendly(error.message) };
  refresh(ticketId.data);
  return { ok: true, message: "Cotización creada." };
}

const itemSchema = z
  .object({
    ticketId: uuid,
    quoteId: uuid,
    kind: z.enum(["service", "product", "custom"]),
    refId: z.string().optional(),
    description: z.string().trim().max(200).optional(),
    qty: z.string().transform((v) => Number(v.replace(",", "."))).pipe(z.number().min(0.01).max(9999)),
    unitPrice: z.string().optional().transform((v) => (v ? Number(v.replace(/[^0-9.]/g, "")) : null)),
    discount: z.string().optional().transform((v) => (v ? Number(v.replace(/[^0-9.]/g, "")) : 0)),
    warrantyDays: z.string().optional().transform((v) => (v ? Number(v) : 0)).pipe(z.number().int().min(0).max(3650)),
    warrantyKind: z.enum(["product", "labor"]).default("labor"),
    concept: z.enum(["labor", "part", "product", "other"]).optional(),
  })
  .refine((v) => v.kind === "custom" || uuid.safeParse(v.refId).success, { message: "Elige el ítem del catálogo.", path: ["refId"] })
  .refine((v) => v.kind !== "custom" || (v.description && v.description.length >= 2 && v.unitPrice !== null), {
    message: "Escribe la descripción y el precio.",
    path: ["description"],
  });

/** El precio de productos y de servicios fijos lo fija la base de datos desde el catálogo. En servicios "Desde" se puede indicar un valor ≥ al mínimo y en "a cotizar" es obligatorio (la BD valida). */
export async function addItemAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["technician", "superadmin"]);
  const parsed = itemSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { count } = await supabase.from("quote_items").select("id", { count: "exact", head: true }).eq("quote_id", v.quoteId);
  let description = v.description || "";
  if (v.kind === "service" || v.kind === "product") {
    const { data: ref } =
      v.kind === "service"
        ? await supabase.from("services").select("name").eq("id", v.refId!).maybeSingle()
        : await supabase.from("products").select("name").eq("id", v.refId!).maybeSingle();
    if (!ref) return { ok: false, error: "Ese ítem no está disponible." };
    description = description || ref.name;
  }
  const { error } = await supabase.from("quote_items").insert({
    quote_id: v.quoteId,
    position: (count ?? 0) + 1,
    kind: v.kind,
    service_id: v.kind === "service" ? v.refId : null,
    product_id: v.kind === "product" ? v.refId : null,
    description,
    qty: v.qty,
    // El servidor fija el precio de catálogo cuando no se envía (la columna es obligatoria solo en los tipos generados).
    unit_price: (v.kind === "custom" || v.kind === "service" ? v.unitPrice : null) as number,
    discount: v.discount,
    warranty_days: v.warrantyDays,
    warranty_kind: v.kind === "product" ? "product" : v.warrantyKind,
    concept: v.kind === "service" ? "labor" : v.kind === "product" ? "product" : (v.concept ?? "part"),
  });
  if (error) return { ok: false, error: friendly(error.message) };
  refresh(v.ticketId);
  return { ok: true, message: "Ítem agregado." };
}

const rm = z.object({ ticketId: uuid, itemId: uuid });
export async function removeItemAction(fd: FormData): Promise<void> {
  await assertRole(["technician", "superadmin"]);
  const p = rm.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("quote_items").delete().eq("id", p.data.itemId);
  refresh(p.data.ticketId);
}

const act = z.object({ ticketId: uuid, quoteId: uuid, message: z.string().trim().max(1000).optional() });
async function run(fd: FormData, fn: "send_quote" | "record_in_person_approval" | "answer_quote_question" | "revise_quote"): Promise<ActionState> {
  const actor = await assertRole(["technician", "superadmin"]);
  const p = act.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return { ok: false, error: "Datos no válidos." };
  const supabase = await createClient();
  const { error } =
    fn === "answer_quote_question"
      ? await supabase.rpc(fn, { p_quote: p.data.quoteId, p_message: p.data.message ?? "" })
      : await supabase.rpc(fn, { p_quote: p.data.quoteId });
  if (error) {
    const known = friendly(error.message);
    if (known.startsWith(GENERIC)) {
      const ref = await reportActionError(`quote.${fn}`, error, { quote_status_hint: fn });
      return { ok: false, error: `${GENERIC} (Ref. ${ref})` };
    }
    // Errores de reglas de negocio conocidos: se muestran claros y se registran como advertencia (sin referencia).
    console.warn(JSON.stringify({ event: "quote_rule", op: `quote.${fn}`, code: error.code }));
    return { ok: false, error: known };
  }
  // Al enviar, el PDF de la cotización se genera solo (versión nueva si es una revisión): el cliente la abre como documento.
  if (fn === "send_quote") {
    const doc = await generateTicketDocument("quote", p.data.ticketId, actor.id).catch(() => null);
    if (!doc?.ok) console.error("quote.pdf", doc && !doc.ok ? doc.error : "error");
  }
  refresh(p.data.ticketId);
  scheduleEmailFlush();
  return { ok: true, message: fn === "send_quote" ? "Cotización enviada al cliente." : "Listo." };
}
export const sendQuoteAction = async (_p: ActionState, fd: FormData) => run(fd, "send_quote");
export const inPersonApprovalAction = async (_p: ActionState, fd: FormData) => run(fd, "record_in_person_approval");
export const answerQuoteAction = async (_p: ActionState, fd: FormData) => run(fd, "answer_quote_question");
export const reviseQuoteAction = async (_p: ActionState, fd: FormData) => run(fd, "revise_quote");

const needsPart = z.object({ ticketId: uuid, quoteId: uuid, needsPart: z.string().optional() });
export async function setNeedsPartAction(fd: FormData): Promise<void> {
  await assertRole(["technician", "superadmin"]);
  const p = needsPart.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("quotes").update({ needs_part: p.data.needsPart === "on" }).eq("id", p.data.quoteId);
  refresh(p.data.ticketId);
}

const urgencySchema = z.object({ ticketId: uuid, quoteId: uuid, levelId: z.union([z.literal(""), uuid]) });
/** Nivel de urgencia de la cotización en borrador. El recargo lo calcula la base de datos con los valores congelados del nivel. */
export async function setUrgencyAction(fd: FormData): Promise<void> {
  await assertRole(["technician", "superadmin"]);
  const p = urgencySchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_quote_urgency", { p_quote: p.data.quoteId, p_level: p.data.levelId || (null as unknown as string) });
  if (error) console.error("quote.urgency", error.code, friendly(error.message));
  refresh(p.data.ticketId);
}

const deliverySchema = z.object({ ticketId: uuid, quoteId: uuid, apply: z.enum(["true", "false"]) });
/** Domicilio como concepto aparte; la tarifa sale de la cobertura del municipio de la dirección. */
export async function setDeliveryAction(fd: FormData): Promise<void> {
  await assertRole(["technician", "superadmin"]);
  const p = deliverySchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_quote_delivery", { p_quote: p.data.quoteId, p_apply: p.data.apply === "true" });
  if (error) console.error("quote.delivery", error.code, friendly(error.message));
  refresh(p.data.ticketId);
}

const shopAdd = z.object({ ticketId: uuid, productId: uuid });
export type ShopAddResult = { ok: boolean; message: string; productId?: string };

/**
 * «Agregar a cotización» desde las recomendaciones del Shop. Técnico asignado o SUPERADMIN (RLS `can_manage_quote` + rol aquí).
 * - Usa el id real del producto; el PRECIO lo fija la base de datos con el catálogo vigente (`quote_item_before`), nunca este código.
 * - Si no hay cotización, la crea en borrador (el diagnóstico y el ticket no se tocan). Si ya fue enviada/aprobada, NO se modifica:
 *   se pide crear una nueva versión por el flujo actual.
 * - Si el producto ya está, aumenta la cantidad en 1 (no duplica la línea).
 * - Se guarda como concepto «producto» (no como repuesto instalado ni mano de obra), con la garantía del producto.
 */
export async function addShopProductToQuoteAction(_p: ShopAddResult | null, fd: FormData): Promise<ShopAddResult> {
  await assertRole(["technician", "superadmin"]);
  const p = shopAdd.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return { ok: false, message: "Producto no válido." };
  const { ticketId, productId } = p.data;
  const supabase = await createClient();
  const { data: prod } = await supabase.from("products").select("id, name, is_active, source_available, warranty_days").eq("id", productId).maybeSingle();
  if (!prod || !prod.is_active) return { ok: false, message: "Ese producto ya no está disponible en el catálogo.", productId };
  if (prod.source_available === false) return { ok: false, message: "Ese producto está agotado en el proveedor; no se puede cotizar ahora.", productId };
  let { data: quote } = await supabase.from("quotes").select("id, status").eq("ticket_id", ticketId).neq("status", "superseded").order("version", { ascending: false }).limit(1).maybeSingle();
  if (!quote) {
    const { data: t } = await supabase.from("tickets").select("customer_id").eq("id", ticketId).maybeSingle();
    if (!t) return { ok: false, message: "Ticket no encontrado.", productId };
    const { data: created, error } = await supabase.from("quotes").insert({ ticket_id: ticketId, customer_id: t.customer_id }).select("id, status").single();
    if (error || !created) return { ok: false, message: friendly(error?.message), productId };
    quote = created;
  }
  if (quote.status !== "draft") return { ok: false, message: "La cotización ya fue enviada al cliente. Para incluir el producto, crea una nueva versión desde la cotización.", productId };
  const { data: existing } = await supabase.from("quote_items").select("id, qty").eq("quote_id", quote.id).eq("product_id", productId).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("quote_items").update({ qty: Number(existing.qty) + 1 }).eq("id", existing.id);
    if (error) return { ok: false, message: friendly(error.message), productId };
    refresh(ticketId);
    return { ok: true, message: `Ya estaba en la cotización: cantidad ${Number(existing.qty) + 1}.`, productId };
  }
  const { count } = await supabase.from("quote_items").select("id", { count: "exact", head: true }).eq("quote_id", quote.id);
  const { error } = await supabase.from("quote_items").insert({
    quote_id: quote.id,
    position: (count ?? 0) + 1,
    kind: "product",
    product_id: productId,
    description: prod.name,
    qty: 1,
    unit_price: null as unknown as number, // lo fija la base de datos con el precio vigente del catálogo
    discount: 0,
    warranty_days: Math.max(0, Number(prod.warranty_days ?? 0)),
    warranty_kind: "product",
    concept: "product",
  });
  if (error) return { ok: false, message: friendly(error.message), productId };
  refresh(ticketId);
  return { ok: true, message: "Producto agregado a la cotización.", productId };
}
