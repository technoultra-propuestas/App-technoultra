"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { DIAGNOSTIC_COMPONENTS } from "@/lib/domain/reception";
import { createClient } from "@/lib/supabase/server";
import { updateOrInsert } from "@/lib/supabase/save";

const uuid = z.string().uuid();
const refresh = (id: string) => revalidatePath(`/b/tickets/${id}`);

const diagSchema = z.object({
  ticketId: uuid,
  summary: z.string().trim().min(3, "Escribe el diagnóstico.").max(4000),
  testsPerformed: z.string().trim().max(4000).optional(),
  recommendations: z.string().trim().max(4000).optional(),
  suggestedParts: z.string().trim().max(1000).optional(),
  visible: z.string().optional(),
});

/** Un diagnóstico vigente por ticket (se actualiza). Los componentes salen de una lista cerrada. */
export async function saveDiagnosisAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["technician", "superadmin"]);
  const parsed = diagSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const row = {
    summary: v.summary,
    tests_performed: v.testsPerformed || null,
    recommendations: v.recommendations || null,
    suggested_parts: v.suggestedParts || null,
    visible_to_customer: v.visible === "on",
  };
  const { data: existing } = await supabase.from("diagnostics").select("id").eq("ticket_id", v.ticketId).order("version", { ascending: false }).limit(1).maybeSingle();
  let id = existing?.id as string | undefined;
  if (id) {
    const { error } = await supabase.from("diagnostics").update(row).eq("id", id);
    if (error) return { ok: false, error: "No pudimos guardar el diagnóstico." };
  } else {
    const { data, error } = await supabase.from("diagnostics").insert({ ticket_id: v.ticketId, version: 1, ...row }).select("id").single();
    if (error || !data) return { ok: false, error: "No pudimos guardar el diagnóstico. Verifica que el ticket sea tuyo." };
    id = data.id;
  }
  const items = DIAGNOSTIC_COMPONENTS.flatMap((c, i) => {
    const state = String(fd.get(`comp_${i}`) ?? "");
    return ["ok", "review", "fail"].includes(state) ? [{ diagnostic_id: id!, component: c, state }] : [];
  });
  if (items.length) {
    for (const it of items) {
      const error = await updateOrInsert(supabase, "diagnostic_items", { diagnostic_id: it.diagnostic_id, component: it.component }, { state: it.state });
      if (error) {
        console.error("diagnostic_items.save", error.code, error.message);
        return { ok: false, error: "No pudimos guardar los componentes evaluados." };
      }
    }
  }
  refresh(v.ticketId);
  return { ok: true, message: "Diagnóstico guardado." };
}

export async function startChecklistAction(fd: FormData): Promise<void> {
  await assertRole(["technician", "superadmin"]);
  const id = uuid.safeParse(fd.get("ticketId"));
  if (!id.success) return;
  await (await createClient()).rpc("start_checklist", { p_ticket: id.data });
  refresh(id.data);
}

const itemSchema = z.object({ ticketId: uuid, itemId: uuid, state: z.enum(["pending", "pass", "fail", "na"]), note: z.string().trim().max(300).optional() });
export async function setChecklistItemAction(fd: FormData): Promise<void> {
  await assertRole(["technician", "superadmin"]);
  const p = itemSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  await (await createClient()).from("checklist_items").update({ state: p.data.state, note: p.data.note || null }).eq("id", p.data.itemId);
  refresh(p.data.ticketId);
}

export async function completeChecklistAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["technician", "superadmin"]);
  const p = z.object({ ticketId: uuid, runId: uuid }).safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return { ok: false, error: "Datos no válidos." };
  const { error } = await (await createClient()).rpc("complete_checklist", { p_run: p.data.runId });
  if (error) return { ok: false, error: /checklist_incomplete/.test(error.message) ? "Hay pruebas obligatorias pendientes o fallidas." : "No pudimos completar el checklist." };
  refresh(p.data.ticketId);
  return { ok: true, message: "Checklist completado." };
}

const deliverySchema = z.object({
  ticketId: uuid,
  receivedBy: z.string().trim().min(2, "Escribe quién recibe el equipo.").max(120),
  notes: z.string().trim().max(1000).optional(),
  nextMaintenance: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
});
export async function saveDeliveryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["technician", "superadmin"]);
  const parsed = deliverySchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("deliveries").insert({
    ticket_id: v.ticketId,
    received_by_name: v.receivedBy,
    notes: v.notes || null,
    next_maintenance_at: v.nextMaintenance ? `${v.nextMaintenance}T09:00:00-05:00` : null,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "La entrega ya fue registrada." : "No pudimos registrar la entrega." };
  refresh(v.ticketId);
  return { ok: true, message: "Entrega registrada. Ahora puedes pasar el ticket a «Entregado»." };
}
