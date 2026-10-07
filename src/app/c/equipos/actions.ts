"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { equipmentSchema } from "@/lib/domain/equipment";
import { safeReturnTo, withParam } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

async function myCustomerId() {
  const profile = await assertRole(["client"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id")
    .eq("profile_id", profile.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new Error("customer_not_found");
  return { supabase, customerId: data.id as string };
}

export async function createEquipmentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = equipmentSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const { supabase, customerId } = await myCustomerId();
  // customer_id sale de la sesión, jamás del formulario (RLS lo vuelve a exigir).
  const { data, error } = await supabase
    .from("equipment")
    .insert({ customer_id: customerId, ...parsed.data })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "No pudimos guardar el equipo." };
  revalidatePath("/c/equipos");
  // Si venía de una solicitud (u otra pantalla de la app), vuelve allí con el equipo recién creado seleccionado.
  const back = safeReturnTo(fd.get("returnTo"));
  redirect(back ? withParam(back, "equipo", data.id) : `/c/equipos/${data.id}`);
}

const idSchema = z.string().uuid();

export async function updateEquipmentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = idSchema.safeParse(fd.get("id"));
  const parsed = equipmentSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!id.success) return { ok: false, error: "Equipo no válido." };
  if (!parsed.success) return zodToState(parsed.error);
  const { supabase } = await myCustomerId();
  // RLS limita la fila al dueño; si el id es de otro cliente, no se actualiza nada.
  const { data, error } = await supabase.from("equipment").update(parsed.data).eq("id", id.data).select("id");
  if (error || !data?.length) return { ok: false, error: "No pudimos guardar los cambios." };
  revalidatePath(`/c/equipos/${id.data}`);
  return { ok: true, message: "Cambios guardados." };
}

export async function archiveEquipmentAction(fd: FormData): Promise<void> {
  const id = idSchema.safeParse(fd.get("id"));
  if (!id.success) return;
  const { supabase } = await myCustomerId();
  await supabase.from("equipment").update({ deleted_at: new Date().toISOString() }).eq("id", id.data);
  revalidatePath("/c/equipos");
  redirect("/c/equipos");
}
