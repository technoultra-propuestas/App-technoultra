"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/session";
import { allow, TOO_MANY } from "@/lib/auth/rate-limit";
import { addressSchema, resolveAddressPlace } from "@/lib/domain/address";
import type { Zone } from "@/lib/domain/delivery";
import { equipmentSchema } from "@/lib/domain/equipment";
import { loadZones } from "@/lib/tickets/zone";
import { createClient } from "@/lib/supabase/server";

type Fail = { ok: false; error: string; fieldErrors?: Record<string, string> };
const DUPLICATE_WINDOW_MS = 10 * 60_000;

async function mine() {
  const profile = await assertRole(["client"]);
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select("id").eq("profile_id", profile.id).is("deleted_at", null).maybeSingle();
  return { profile, supabase, customerId: (data?.id as string | undefined) ?? null };
}
const fields = (issues: { path: PropertyKey[]; message: string }[]) => Object.fromEntries(issues.map((i) => [String(i.path[0]), i.message]));
const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Registra un equipo NUEVO desde la solicitud y lo deja listo para seleccionar. El dueño sale de la sesión (jamás del navegador) y RLS lo
 * vuelve a exigir. Un doble clic o un reintento NO crea un duplicado: un equipo idéntico creado hace menos de 10 minutos se reutiliza.
 */
export async function quickCreateEquipment(input: Record<string, string>): Promise<{ ok: true; equipment: { id: string; type: string; brand: string; model: string }; reused: boolean } | Fail> {
  const { profile, supabase, customerId } = await mine();
  if (!customerId) return { ok: false, error: "No encontramos tu ficha de cliente." };
  const parsed = equipmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa los datos del equipo.", fieldErrors: fields(parsed.error.issues) };
  if (!(await allow("equipment-create", profile.id, 30, 3600))) return { ok: false, error: TOO_MANY };
  const v = parsed.data;
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const { data: recent } = await supabase.from("equipment").select("id, type, brand, model, serial").is("deleted_at", null).gte("created_at", since);
  const same = (recent ?? []).find((e) => e.type === v.type && norm(e.brand) === norm(v.brand) && norm(e.model) === norm(v.model) && norm(e.serial) === norm(v.serial));
  if (same) return { ok: true, equipment: { id: same.id, type: same.type, brand: same.brand, model: same.model }, reused: true };
  const { data, error } = await supabase.from("equipment").insert({ customer_id: customerId, ...v }).select("id, type, brand, model").single();
  if (error || !data) return { ok: false, error: "No pudimos guardar el equipo. Inténtalo de nuevo." };
  revalidatePath("/c/equipos");
  return { ok: true, equipment: data, reused: false };
}

export type NewAddress = { id: string; label: string; line1: string; neighborhood: string | null; city_name: string; zone: Zone };

/**
 * Registra una dirección NUEVA (casa, oficina, otra sede…) sin reemplazar las anteriores. Queda asociada al cliente de la sesión. Se devuelve
 * junto con su zona (cobertura y tarifa del municipio) para mostrar de inmediato si admite domicilio; registrar una dirección NO habilita un
 * domicilio fuera de cobertura (eso lo sigue validando el servidor al crear la solicitud). Reutiliza una idéntica creada hace < 10 minutos.
 */
export async function quickCreateAddress(input: Record<string, string>, modalities: string[]): Promise<{ ok: true; address: NewAddress; reused: boolean } | Fail> {
  const { profile, supabase, customerId } = await mine();
  if (!customerId) return { ok: false, error: "No encontramos tu ficha de cliente." };
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa los datos de la dirección.", fieldErrors: fields(parsed.error.issues) };
  if (!(await allow("address-create", profile.id, 30, 3600))) return { ok: false, error: TOO_MANY };
  const v = parsed.data;
  const place = await resolveAddressPlace(supabase, v);
  if (!place.ok) return { ok: false, error: place.error };
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const { data: recent } = await supabase.from("addresses").select("id, label, line1, neighborhood, city_name, dane_code").is("deleted_at", null).gte("created_at", since);
  let row = (recent ?? []).find((a) => a.dane_code === place.dane_code && norm(a.line1) === norm(v.line1));
  const reused = Boolean(row);
  if (!row) {
    const { count } = await supabase.from("addresses").select("id", { count: "exact", head: true }).is("deleted_at", null);
    const { data, error } = await supabase
      .from("addresses")
      .insert({
        customer_id: customerId,
        label: v.label || "Casa",
        line1: v.line1,
        neighborhood: v.neighborhood || null,
        notes: v.notes || null,
        city_name: place.city_name,
        department: place.department,
        dane_code: place.dane_code,
        is_default: (count ?? 0) === 0,
      })
      .select("id, label, line1, neighborhood, city_name, dane_code")
      .single();
    if (error || !data) return { ok: false, error: "No pudimos guardar la dirección. Inténtalo de nuevo." };
    row = data;
    revalidatePath("/c/direcciones");
  }
  const zones = await loadZones(supabase, [row.dane_code], modalities);
  const zone = { ...(zones.get(row.dane_code) as Zone), city: row.city_name };
  return { ok: true, reused, address: { id: row.id, label: row.label, line1: row.line1, neighborhood: row.neighborhood, city_name: row.city_name, zone } };
}
