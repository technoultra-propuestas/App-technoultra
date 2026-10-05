"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, phoneCO, type ActionState } from "@/lib/auth/schemas";
import { EQUIPMENT_TYPES } from "@/lib/domain/equipment";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  customerId: z.union([z.literal(""), z.string().uuid()]).optional(),
  newName: z.string().trim().max(120).optional(),
  newPhone: z.string().trim().optional(),
  newEmail: z.string().trim().toLowerCase().max(254).optional(),
  equipmentId: z.union([z.literal(""), z.string().uuid()]).optional(),
  eqType: z.enum(EQUIPMENT_TYPES).optional(),
  eqBrand: z.string().trim().max(60).optional(),
  eqModel: z.string().trim().max(80).optional(),
  eqSerial: z.string().trim().max(60).optional(),
  serviceId: z.union([z.literal(""), z.string().uuid()]).optional(),
  modality: z.enum(["store", "pickup", "home", "remote"]),
  problem: z.string().trim().min(5, "Describe el problema (mínimo 5 caracteres).").max(2000),
});

/**
 * Ticket de mostrador: el cliente está presente (o llamó). Se crean, si hace falta, la ficha del cliente (sin cuenta) y el equipo.
 * Todo con la sesión del personal: RLS decide qué puede insertar; el estado inicial lo fija la base de datos ("Recibido").
 */
export async function createWalkinAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await assertRole(["technician", "superadmin"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();

  let customerId = v.customerId || "";
  if (!customerId) {
    if (!v.newName || v.newName.length < 3) return { ok: false, error: "Elige un cliente o escribe el nombre del cliente nuevo." };
    const phone = phoneCO.safeParse(v.newPhone ?? "");
    if (!phone.success) return { ok: false, error: phone.error.issues[0]?.message ?? "Celular no válido." };
    const email = v.newEmail ? z.string().email().safeParse(v.newEmail) : null;
    if (email && !email.success) return { ok: false, error: "Correo no válido." };
    const { data, error } = await supabase.from("customers").insert({ full_name: v.newName, phone: phone.data, email: v.newEmail || null }).select("id").single();
    if (error || !data) return { ok: false, error: error?.code === "23505" ? "Ya existe un cliente con ese celular. Búscalo en la lista." : "No pudimos crear el cliente." };
    customerId = data.id;
  }

  let equipmentId = v.equipmentId || null;
  if (!equipmentId && v.eqType && v.eqBrand && v.eqModel) {
    const { data, error } = await supabase.from("equipment").insert({ customer_id: customerId, type: v.eqType, brand: v.eqBrand, model: v.eqModel, serial: v.eqSerial || null }).select("id").single();
    if (error || !data) return { ok: false, error: "No pudimos registrar el equipo." };
    equipmentId = data.id;
  }

  const { data: t, error } = await supabase
    .from("tickets")
    .insert({ customer_id: customerId, equipment_id: equipmentId, service_id: v.serviceId || null, modality: v.modality, problem: v.problem, assigned_to: staff.id })
    .select("id")
    .single();
  if (error || !t) return { ok: false, error: "No pudimos crear el ticket. Verifica el cliente y el equipo." };
  redirect(`/b/tickets/${t.id}`);
}
