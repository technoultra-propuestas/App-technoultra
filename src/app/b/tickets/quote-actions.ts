"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { scheduleEmailFlush } from "@/lib/email/outbox";
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
];
const friendly = (m?: string) => QUOTE_ERRORS.find(([re]) => m && re.test(m))?.[1] ?? "No pudimos completar la acción. Inténtalo de nuevo.";
const uuid = z.string().uuid();
const refresh = (ticketId: string) => revalidatePath(`/b/tickets/${ticketId}`);

export async function createQuoteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["technician", "admin"]);
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
  })
  .refine((v) => v.kind === "custom" || uuid.safeParse(v.refId).success, { message: "Elige el ítem del catálogo.", path: ["refId"] })
  .refine((v) => v.kind !== "custom" || (v.description && v.description.length >= 2 && v.unitPrice !== null), {
    message: "Escribe la descripción y el precio.",
    path: ["description"],
  });

/** El precio de servicios y productos lo fija la base de datos desde el catálogo (unit_price vacío). */
export async function addItemAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["technician", "admin"]);
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
    unit_price: v.kind === "custom" ? v.unitPrice : null,
    discount: v.discount,
    warranty_days: v.warrantyDays,
    warranty_kind: v.kind === "product" ? "product" : v.warrantyKind,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  refresh(v.ticketId);
  return { ok: true, message: "Ítem agregado." };
}

const rm = z.object({ ticketId: uuid, itemId: uuid });
export async function removeItemAction(fd: FormData): Promise<void> {
  await assertRole(["technician", "admin"]);
  const p = rm.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("quote_items").delete().eq("id", p.data.itemId);
  refresh(p.data.ticketId);
}

const act = z.object({ ticketId: uuid, quoteId: uuid, message: z.string().trim().max(1000).optional() });
async function run(fd: FormData, fn: "send_quote" | "record_in_person_approval" | "answer_quote_question" | "revise_quote"): Promise<ActionState> {
  await assertRole(["technician", "admin"]);
  const p = act.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return { ok: false, error: "Datos no válidos." };
  const supabase = await createClient();
  const { error } =
    fn === "answer_quote_question"
      ? await supabase.rpc(fn, { p_quote: p.data.quoteId, p_message: p.data.message ?? "" })
      : await supabase.rpc(fn, { p_quote: p.data.quoteId });
  if (error) return { ok: false, error: friendly(error.message) };
  refresh(p.data.ticketId);
  scheduleEmailFlush();
  return { ok: true, message: "Listo." };
}
export const sendQuoteAction = async (_p: ActionState, fd: FormData) => run(fd, "send_quote");
export const inPersonApprovalAction = async (_p: ActionState, fd: FormData) => run(fd, "record_in_person_approval");
export const answerQuoteAction = async (_p: ActionState, fd: FormData) => run(fd, "answer_quote_question");
export const reviseQuoteAction = async (_p: ActionState, fd: FormData) => run(fd, "revise_quote");

const needsPart = z.object({ ticketId: uuid, quoteId: uuid, needsPart: z.string().optional() });
export async function setNeedsPartAction(fd: FormData): Promise<void> {
  await assertRole(["technician", "admin"]);
  const p = needsPart.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("quotes").update({ needs_part: p.data.needsPart === "on" }).eq("id", p.data.quoteId);
  refresh(p.data.ticketId);
}
