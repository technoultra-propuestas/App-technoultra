"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { generateTicketDocument } from "@/lib/documents/generate";
import { loadProposal } from "@/lib/quotes/load";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

const applySchema = z.object({ ticketId: uuid });

/**
 * «Usar propuesta»: crea la cotización en borrador (si no existe) con los servicios que el técnico dejó marcados. El navegador solo
 * envía los ids de servicio elegidos; la propuesta, el precio y los totales se recalculan aquí y en la base de datos (precio de catálogo
 * obligatorio, totales por trigger). Las líneas «Requiere revisión» sin precio no se insertan: el técnico las agrega con su valor.
 */
export async function applyProposalAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["technician", "superadmin"]);
  const parsed = applySchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: "Ticket no válido." };
  const keys = new Set(fd.getAll("keys").map(String).filter((k) => uuid.safeParse(k).success));
  if (keys.size === 0) return { ok: false, error: "Marca al menos un servicio de la propuesta." };
  const supabase = await createClient();
  const loaded = await loadProposal(supabase, parsed.data.ticketId);
  if (!loaded) return { ok: false, error: "Ticket no encontrado." };
  const chosen = loaded.proposal.lines.filter((l) => keys.has(l.key) && l.unitPrice !== null);
  if (chosen.length === 0) return { ok: false, error: "Esos servicios necesitan que definas el valor: agrégalos manualmente." };

  const { data: t } = await supabase.from("tickets").select("customer_id").eq("id", parsed.data.ticketId).maybeSingle();
  if (!t) return { ok: false, error: "Ticket no encontrado." };
  const { data: existing } = await supabase.from("quotes").select("id, status").eq("ticket_id", parsed.data.ticketId).neq("status", "superseded").order("version", { ascending: false }).limit(1).maybeSingle();
  let quoteId = existing?.id as string | undefined;
  if (existing && existing.status !== "draft") return { ok: false, error: "La cotización ya fue enviada. Crea una nueva versión para cambiarla." };
  if (!quoteId) {
    const { data: q, error } = await supabase.from("quotes").insert({ ticket_id: parsed.data.ticketId, customer_id: t.customer_id }).select("id").single();
    if (error || !q) return { ok: false, error: "No pudimos crear la cotización." };
    quoteId = q.id;
  }
  const { data: items } = await supabase.from("quote_items").select("service_id").eq("quote_id", quoteId);
  const have = new Set((items ?? []).map((i) => i.service_id));
  let pos = (items ?? []).length;
  let added = 0;
  for (const l of chosen) {
    if (have.has(l.serviceId)) continue;
    const { error } = await supabase.from("quote_items").insert({
      quote_id: quoteId,
      position: ++pos,
      kind: "service",
      service_id: l.serviceId,
      description: l.name,
      qty: 1,
      unit_price: l.unitPrice as number,
      warranty_days: 0,
      warranty_kind: "labor",
      concept: "labor",
      priority: l.priority,
      suggested_by_system: true,
    });
    if (error) {
      console.error("proposal.apply", error.code, error.message);
      return { ok: false, error: "No pudimos agregar todos los servicios. Revisa la cotización." };
    }
    added++;
  }
  revalidatePath(`/b/tickets/${parsed.data.ticketId}`);
  return { ok: true, message: added ? `Propuesta aplicada: ${added} ${added === 1 ? "servicio agregado" : "servicios agregados"}. Revísala y envíala.` : "Esos servicios ya estaban en la cotización." };
}

/**
 * «Finalizar diagnóstico»: marca el diagnóstico como emitido (visible para el cliente, con constancia en auditoría) y genera el PDF
 * «Informe de diagnóstico» (versión nueva si ya existía uno). El técnico valida el contenido; nada se emite solo.
 */
export async function finalizeDiagnosisAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole(["technician", "superadmin"]);
  const id = uuid.safeParse(fd.get("ticketId"));
  if (!id.success) return zodToState(id.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_diagnosis", { p_ticket: id.data });
  if (error) return { ok: false, error: /diagnosis_missing/.test(error.message) ? "Primero guarda el diagnóstico." : "No pudimos finalizar el diagnóstico." };
  const doc = await generateTicketDocument("diagnosis", id.data, actor.id);
  revalidatePath(`/b/tickets/${id.data}`);
  revalidatePath(`/c/tickets/${id.data}`);
  return doc.ok ? { ok: true, message: "Diagnóstico finalizado. El cliente ya puede verlo." } : { ok: true, message: "Diagnóstico finalizado, pero no se pudo generar el PDF. Genéralo desde Documentos." };
}
