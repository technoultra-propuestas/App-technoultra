"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const num = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? 0 : Number(v.replace(/[^0-9.]/g, ""))))
    .pipe(z.number().min(min).max(max));

const taxSchema = z.object({
  responsible: z.string().optional(),
  rate: num(0, 100),
});

/** Configuración fiscal (solo administración; la BD valida los valores y audita el cambio). No toca ningún precio existente. */
export async function saveTaxAction(fd: FormData): Promise<void> {
  await assertRole(["admin"]);
  const p = taxSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) redirect("/b/comercial?error=impuestos");
  const supabase = await createClient();
  const a = await supabase.from("app_settings").update({ value: p.data.responsible === "on" }).eq("key", "tax.vat_responsible");
  const b = await supabase.from("app_settings").update({ value: p.data.rate }).eq("key", "tax.vat_rate");
  if (a.error || b.error) redirect("/b/comercial?error=impuestos");
  revalidatePath("/b/comercial");
  redirect("/b/comercial?ok=impuestos");
}

const time = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .or(z.literal(""));
const urgencySchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(3).max(60),
  percent: num(0, 300),
  fixed: num(0, 100_000_000),
  min: num(0, 100_000_000),
  start: time,
  end: time,
  active: z.string().optional(),
});

/** Nivel de urgencia: porcentaje, valor fijo, mínimo, horario, días, modalidades y servicios a los que aplica. */
export async function saveUrgencyAction(fd: FormData): Promise<void> {
  await assertRole(["admin"]);
  const p = urgencySchema.safeParse(Object.fromEntries(fd.entries()));
  const days = fd.getAll("days").map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  const modalities = fd.getAll("modalities").map(String).filter((m): m is "store" | "pickup" | "home" | "remote" => ["store", "pickup", "home", "remote"].includes(m));
  const services = fd.getAll("services").map(String).filter((s) => z.string().uuid().safeParse(s).success);
  if (!p.success || days.length === 0 || modalities.length === 0 || (p.data.start === "") !== (p.data.end === "")) redirect("/b/comercial?error=urgencia");
  const v = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("urgency_levels")
    .update({
      label: v.label,
      percent: v.percent,
      fixed_amount: v.fixed,
      min_amount: v.min,
      days,
      start_time: v.start || null,
      end_time: v.end || null,
      modalities,
      is_active: v.active === "on",
    })
    .eq("id", v.id)
    .select("id");
  if (error || !data?.length) redirect("/b/comercial?error=urgencia");
  await supabase.from("urgency_level_services").delete().eq("level_id", v.id);
  if (services.length) await supabase.from("urgency_level_services").insert(services.map((service_id) => ({ level_id: v.id, service_id })));
  revalidatePath("/b/comercial");
  redirect("/b/comercial?ok=urgencia");
}
