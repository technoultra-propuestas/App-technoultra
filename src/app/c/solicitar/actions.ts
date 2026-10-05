"use server";

import { redirect } from "next/navigation";
import { assertRole } from "@/lib/auth/session";
import { allow, TOO_MANY } from "@/lib/auth/rate-limit";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { friendlyRequestError, requestSchema, toPreferredAt } from "@/lib/domain/requests";
import { createClient } from "@/lib/supabase/server";

/**
 * Crea la solicitud. La cobertura geográfica, la coherencia servicio/modalidad y la propiedad de equipo y dirección
 * las valida un trigger en la base de datos: cambiar la ciudad o la modalidad en el navegador no permite saltarlas.
 */
export async function createRequestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const profile = await assertRole(["client"]);
  const parsed = requestSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  if (!(await allow("request-user", profile.id, 10, 3600))) return { ok: false, error: TOO_MANY };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("profile_id", profile.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!customer) return { ok: false, error: "No encontramos tu ficha de cliente." };

  const { data, error } = await supabase
    .from("service_requests")
    .insert({
      customer_id: customer.id,
      service_id: v.serviceId,
      modality: v.modality,
      equipment_id: v.equipmentId || null,
      address_id: v.modality === "remote" ? v.addressId || null : v.addressId || null,
      problem_description: v.problem,
      preferred_at: toPreferredAt(v.day, v.slot),
    })
    .select("code")
    .single();
  if (error || !data) return { ok: false, error: friendlyRequestError(error?.message) };
  redirect(`/c/solicitar/listo?c=${encodeURIComponent(data.code)}`);
}
