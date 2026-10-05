"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

const money = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v.replace(/[^0-9.]/g, "")) : 0))
  .pipe(z.number().min(0).max(10_000_000));

const areaSchema = z.object({
  department: z.string().trim().min(2, "Escribe el departamento.").max(80),
  city: z.string().trim().min(2, "Escribe la ciudad.").max(80),
  dane: z.string().regex(/^[0-9]{5}$/, "El código DANE tiene 5 dígitos."),
  pickupFee: money,
  homeFee: money,
});

/** Administración: la cobertura se gestiona aquí sin tocar código. RLS + permiso `catalog.manage` lo vuelven a exigir. */
export async function addAreaAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole(["superadmin"]);
  const parsed = areaSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("coverage_areas").insert({
    department: v.department,
    city_name: v.city,
    dane_code: v.dane,
    pickup_fee: v.pickupFee,
    home_fee: v.homeFee,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "Ese municipio ya está en la lista." : "No pudimos guardar la ciudad." };
  revalidatePath("/b/cobertura");
  return { ok: true, message: "Ciudad agregada." };
}

const toggleSchema = z.object({ id: z.string().uuid(), active: z.enum(["true", "false"]) });
export async function toggleAreaAction(fd: FormData): Promise<void> {
  await assertRole(["superadmin"]);
  const p = toggleSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("coverage_areas").update({ is_active: p.data.active === "true" }).eq("id", p.data.id);
  revalidatePath("/b/cobertura");
}

const feesSchema = z.object({ id: z.string().uuid(), pickupFee: money, homeFee: money });
export async function updateFeesAction(fd: FormData): Promise<void> {
  await assertRole(["superadmin"]);
  const p = feesSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("coverage_areas").update({ pickup_fee: p.data.pickupFee, home_fee: p.data.homeFee }).eq("id", p.data.id);
  revalidatePath("/b/cobertura");
}
