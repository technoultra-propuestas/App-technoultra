"use server";

import { redirect } from "next/navigation";
import { assertRole } from "@/lib/auth/session";
import { allow, TOO_MANY } from "@/lib/auth/rate-limit";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { friendlyRequestError, requestSchema, toPreferredAt } from "@/lib/domain/requests";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { deliverySnapshot } from "@/lib/domain/delivery";
import { loadZones } from "@/lib/tickets/zone";
import { scheduleEmailFlush } from "@/lib/email/outbox";

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

  // Doble clic / reintento: si ya existe una solicitud idéntica reciente de este cliente, se reutiliza (una sola solicitud y un solo ticket).
  const since = new Date(Date.now() - 120_000).toISOString();
  const { data: dup } = await supabase
    .from("service_requests")
    .select("id, code")
    .eq("customer_id", customer.id)
    .eq("service_id", v.serviceId)
    .eq("modality", v.modality)
    .eq("problem_description", v.problem)
    .in("status", ["pending", "scheduled", "converted"])
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  const created = dup
    ? { data: dup, error: null }
    : await supabase
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
    .select("id, code")
    .single();
  const { data, error } = created;
  if (error || !data) return { ok: false, error: friendlyRequestError(error?.message) };
  // Domicilio/recogida: se registra en la solicitud el valor ESTIMADO calculado aquí (servidor) con la tarifa vigente de la zona de la dirección.
  // Es informativo: el cobro lo fija la cotización (concepto aparte) y nunca se toma un valor enviado por el navegador.
  if (!dup && (v.modality === "home" || v.modality === "pickup") && v.addressId) {
    const { data: addr } = await supabase.from("addresses").select("dane_code, city_name").eq("id", v.addressId).maybeSingle();
    if (addr) {
      const zone = (await loadZones(supabase, [addr.dane_code], [v.modality])).get(addr.dane_code);
      if (zone) {
        const admin = createAdminClient();
        const { data: cur } = await admin.from("service_requests").select("service_snapshot").eq("id", data.id).maybeSingle();
        const base = (cur?.service_snapshot as Record<string, unknown> | null) ?? {};
        await admin.from("service_requests").update({ service_snapshot: { ...base, delivery: deliverySnapshot(v.modality, { ...zone, city: addr.city_name }) } }).eq("id", data.id);
      }
    }
  }
  // Vincula el diagnóstico preliminar (si lo hubo) a la solicitud, solo si pertenece a este cliente.
  const aiId = z.string().uuid().safeParse(fd.get("aiId"));
  if (aiId.success) {
    await createAdminClient().from("ai_diagnostics").update({ service_request_id: data.id }).eq("id", aiId.data).eq("customer_id", customer.id).is("service_request_id", null);
  }
  // El ticket nace solo (idempotente, solo servidor). Si falla, la solicitud queda registrada y el SUPERADMIN puede recibirla a mano.
  const { data: ticketId, error: tErr } = await createAdminClient().rpc("auto_create_ticket", { p_request: data.id });
  if (tErr && !/service_not_technical/.test(tErr.message)) console.error("request.auto_ticket", tErr.code);
  // El diagnóstico preliminar de IA viaja con el ticket (el técnico lo ve y lo valida), igual que cuando el personal recibía la solicitud a mano.
  if (ticketId) await createAdminClient().from("ai_diagnostics").update({ ticket_id: ticketId }).eq("service_request_id", data.id).is("ticket_id", null);
  scheduleEmailFlush();
  redirect(`/c/solicitar/listo?c=${encodeURIComponent(data.code)}${ticketId ? `&t=${ticketId}` : ""}`);
}
