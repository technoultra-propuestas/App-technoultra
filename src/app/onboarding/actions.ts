"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth/session";
import { phoneCO, zodToState, type ActionState } from "@/lib/auth/schemas";

const form = (fd: FormData) => Object.fromEntries(fd.entries());

async function ctx() {
  const profile = await assertRole(["client"]);
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!customer) throw new Error("customer_not_found");
  return { profile, supabase, customerId: customer.id as string };
}

/** El paso solo avanza hacia adelante un lugar a la vez desde el backend (no se confía en el valor del navegador). */
async function setStep(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  current: number,
  to: number,
) {
  if (to !== current + 1 && to !== current - 1) return;
  await supabase
    .from("profiles")
    .update({ onboarding_step: Math.max(0, Math.min(5, to)) })
    .eq("id", profileId);
}

export async function nextStepAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { profile, supabase } = await ctx();
  const dir = fd.get("dir") === "back" ? -1 : 1;
  await setStep(supabase, profile.id, profile.onboarding_step, profile.onboarding_step + dir);
  redirect("/onboarding");
}

const phoneSchema = z.object({ phone: phoneCO });
export async function savePhoneAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = phoneSchema.safeParse(form(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const { profile, supabase, customerId } = await ctx();
  const { error } = await supabase
    .from("customers")
    .update({ phone: parsed.data.phone })
    .eq("id", customerId);
  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "Ese celular ya está registrado en otra cuenta."
          : "No pudimos guardar tu celular.",
    };
  }
  await setStep(supabase, profile.id, profile.onboarding_step, 2);
  redirect("/onboarding");
}

const addressSchema = z.object({
  line1: z.string().trim().min(3, "Escribe tu dirección.").max(160),
  neighborhood: z.string().trim().max(100).optional(),
  dane: z.string().regex(/^[0-9]{5}$|^other$/, "Elige tu ciudad."),
  otherCity: z.string().trim().max(80).optional(),
  otherDept: z.string().trim().max(80).optional(),
});
export async function saveAddressAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = addressSchema.safeParse(form(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const { line1, neighborhood, dane, otherCity, otherDept } = parsed.data;
  const { profile, supabase, customerId } = await ctx();

  let city_name: string, department: string, dane_code: string;
  if (dane === "other") {
    if (!otherCity || otherCity.length < 2 || !otherDept || otherDept.length < 2)
      return { ok: false, error: "Escribe tu ciudad y departamento." };
    city_name = otherCity;
    department = otherDept;
    dane_code = "00000"; // sin cobertura física: solo soporte remoto
  } else {
    // La ciudad y el departamento salen de la tabla de cobertura, no del navegador.
    const { data: area } = await supabase
      .from("coverage_areas")
      .select("city_name, department, dane_code")
      .eq("dane_code", dane)
      .eq("is_active", true)
      .maybeSingle();
    if (!area) return { ok: false, error: "Elige una ciudad de la lista." };
    ({ city_name, department, dane_code } = area as {
      city_name: string;
      department: string;
      dane_code: string;
    });
  }
  const { error } = await supabase.from("addresses").insert({
    customer_id: customerId,
    label: "Casa",
    line1,
    neighborhood: neighborhood || null,
    city_name,
    department,
    dane_code,
    is_default: true,
  });
  if (error) return { ok: false, error: "No pudimos guardar tu dirección." };
  await setStep(supabase, profile.id, profile.onboarding_step, 3);
  redirect("/onboarding");
}

const equipmentSchema = z.object({
  type: z.enum(["laptop", "desktop", "all_in_one", "printer", "network", "other"]),
  brand: z.string().trim().min(1, "Escribe la marca.").max(60),
  model: z.string().trim().min(1, "Escribe el modelo.").max(80),
  serial: z.string().trim().max(60).optional(),
});
export async function saveEquipmentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = equipmentSchema.safeParse(form(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const { profile, supabase, customerId } = await ctx();
  const { error } = await supabase
    .from("equipment")
    .insert({ customer_id: customerId, ...parsed.data, serial: parsed.data.serial || null });
  if (error) return { ok: false, error: "No pudimos guardar tu equipo." };
  await setStep(supabase, profile.id, profile.onboarding_step, 4);
  redirect("/onboarding");
}

export async function skipEquipmentAction(): Promise<void> {
  const { profile, supabase } = await ctx();
  await setStep(supabase, profile.id, profile.onboarding_step, 4);
  redirect("/onboarding");
}

/** Resultado REAL del permiso del navegador. 'granted' solo habilita la preferencia; nunca se asume. */
const notifSchema = z.object({
  permission: z.enum(["granted", "denied", "default", "unsupported", "error"]),
});
export async function saveNotificationPermissionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = notifSchema.safeParse(form(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const { profile, supabase } = await ctx();
  await supabase
    .from("notification_preferences")
    .upsert(
      { profile_id: profile.id, in_app_enabled: true, push_enabled: parsed.data.permission === "granted" },
      { onConflict: "profile_id" },
    );
  await setStep(supabase, profile.id, profile.onboarding_step, 5);
  redirect("/onboarding");
}

/** Registra la versión exacta de cada documento pendiente y finaliza el onboarding (validado en base de datos). */
export async function finishOnboardingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (fd.get("accept") !== "on") return { ok: false, error: "Debes aceptar los documentos para continuar." };
  const { supabase } = await ctx();
  const { data: pending, error: pErr } = await supabase.rpc("pending_legal_documents");
  if (pErr) return { ok: false, error: "No pudimos cargar los documentos legales." };
  for (const doc of (pending ?? []) as { id: string }[]) {
    const { error } = await supabase.rpc("accept_legal_document", { p_document: doc.id });
    if (error) return { ok: false, error: "No pudimos registrar tu aceptación. Inténtalo de nuevo." };
  }
  const { error } = await supabase.rpc("complete_onboarding");
  if (error) return { ok: false, error: "Falta completar algún dato (por ejemplo, tu celular)." };
  redirect("/c");
}
