"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { generateTicketDocument, type DocKind } from "@/lib/documents/generate";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleEmailFlush } from "@/lib/email/outbox";
import { createClient } from "@/lib/supabase/server";

const TRANSITION_ERRORS: [RegExp, string][] = [
  [/forbidden/, "No tienes permiso para esta acción."],
  [/invalid_transition/, "Ese cambio de estado no está permitido desde el estado actual."],
  [/reason_required/, "Escribe el motivo del cambio."],
  [/reception_missing/, "Primero registra la recepción del equipo."],
  [/reception_photos_missing/, "Faltan fotografías de recepción obligatorias."],
  [/quote_not_sent/, "Primero envía la cotización al cliente."],
  [/quote_not_approved/, "La cotización todavía no está aprobada."],
  [/checklist_missing/, "Primero inicia el checklist de pruebas."],
  [/checklist_incomplete/, "Hay pruebas obligatorias pendientes o fallidas en el checklist."],
  [/delivery_record_missing/, "Primero registra los datos de la entrega."],
];
const friendlyTransitionError = (m?: string) =>
  TRANSITION_ERRORS.find(([re]) => m && re.test(m))?.[1] ?? "No pudimos cambiar el estado. Inténtalo de nuevo.";

/** Documentos que se generan solos al llegar a cada etapa (mejor esfuerzo: un fallo no deshace la transición). */
async function autoDocuments(ticketId: string, to: string, actorId: string) {
  const wanted: DocKind[] = to === "diagnosing" ? ["reception"] : to === "delivered" ? ["delivery", "warranty_product", "warranty_labor"] : [];
  if (!wanted.length) return;
  const admin = createAdminClient();
  for (const kind of wanted) {
    try {
      const { count } = await admin.from("documents").select("id", { count: "exact", head: true }).eq("ticket_id", ticketId).eq("doc_type", kind);
      if (!count) await generateTicketDocument(kind, ticketId, actorId);
    } catch (e) {
      console.error("documents.auto", kind, (e as Error).message);
    }
  }
}

const transitionSchema = z.object({
  ticketId: z.string().uuid(),
  to: z.enum(["received", "diagnosing", "awaiting_approval", "awaiting_part", "in_service", "testing", "ready", "delivered", "cancelled"]),
  reason: z.string().trim().max(500).optional(),
});

/** El estado solo cambia por la función de base de datos: valida rol, asignación, transición y precondiciones. */
export async function transitionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole(["technician", "superadmin"]);
  const parsed = transitionSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_ticket", { p_ticket: parsed.data.ticketId, p_to: parsed.data.to, p_reason: parsed.data.reason || undefined });
  if (error) return { ok: false, error: friendlyTransitionError(error.message) };
  await autoDocuments(parsed.data.ticketId, parsed.data.to, actor.id);
  scheduleEmailFlush();
  revalidatePath(`/b/tickets/${parsed.data.ticketId}`);
  revalidatePath("/b/tickets");
  return { ok: true, message: "Estado actualizado." };
}

const assignSchema = z.object({ ticketId: z.string().uuid(), staffId: z.string().uuid() });
export async function assignAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["superadmin"]);
  const parsed = assignSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: "Elige a quién asignar." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_ticket", { p_ticket: parsed.data.ticketId, p_staff: parsed.data.staffId });
  if (error) return { ok: false, error: "No pudimos asignar el ticket." };
  revalidatePath(`/b/tickets/${parsed.data.ticketId}`);
  return { ok: true, message: "Ticket asignado." };
}

const noteSchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1, "Escribe la nota.").max(2000),
  visibility: z.enum(["internal", "customer"]),
});
export async function addNoteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["technician", "superadmin"]);
  const parsed = noteSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("ticket_notes").insert({ ticket_id: parsed.data.ticketId, body: parsed.data.body, visibility: parsed.data.visibility });
  if (error) return { ok: false, error: "No pudimos guardar la nota." };
  revalidatePath(`/b/tickets/${parsed.data.ticketId}`);
  return { ok: true, message: "Nota guardada." };
}

/** Convierte una solicitud pendiente en ticket (recepción del equipo). Solo administración. */
export async function receiveRequestAction(fd: FormData): Promise<void> {
  const admin = await assertRole(["superadmin"]);
  const id = z.string().uuid().safeParse(fd.get("requestId"));
  if (!id.success) return;
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("service_requests")
    .select("id, customer_id, equipment_id, service_id, modality, problem_description, status")
    .eq("id", id.data)
    .maybeSingle();
  if (!r || !["pending", "scheduled"].includes(r.status)) return;
  const { data: svc } = await supabase.from("services").select("name, kind").eq("id", r.service_id).maybeSingle();
  if (svc?.kind === "digital") {
    // Las soluciones digitales no pasan por el flujo de equipos: nacen como proyecto.
    const { data: proj, error: pErr } = await supabase.from("digital_projects").insert({ customer_id: r.customer_id, service_id: r.service_id, title: svc.name, scope: r.problem_description, status: "lead", owner_id: admin.id }).select("id").single();
    if (pErr || !proj) return;
    await createAdminClient().from("service_requests").update({ status: "converted" }).eq("id", r.id);
    revalidatePath("/b/solicitudes");
    redirect(`/b/proyectos/${proj.id}`);
  }
  const { data: t, error } = await supabase
    .from("tickets")
    .insert({
      customer_id: r.customer_id,
      equipment_id: r.equipment_id,
      service_request_id: r.id,
      service_id: r.service_id,
      modality: r.modality,
      problem: r.problem_description,
      assigned_to: admin.id,
    })
    .select("id")
    .single();
  if (error || !t) return;
  // El diagnóstico preliminar de la solicitud pasa a acompañar al ticket (para validación humana).
  await createAdminClient().from("ai_diagnostics").update({ ticket_id: t.id }).eq("service_request_id", r.id).is("ticket_id", null);
  revalidatePath("/b/solicitudes");
  redirect(`/b/tickets/${t.id}`);
}
