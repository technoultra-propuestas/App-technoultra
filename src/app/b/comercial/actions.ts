"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditAdmin } from "@/lib/auth/audit";
import { assertRole } from "@/lib/auth/session";
import type { ActionState } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

const num = (min: number, max: number, what: string) =>
  z
    .string()
    .trim()
    .regex(/^[0-9]*([.,][0-9]+)?$/, `${what}: escribe solo números.`)
    .transform((v) => (v === "" ? 0 : Number(v.replace(",", "."))))
    .pipe(z.number().min(min, `${what}: mínimo ${min}.`).max(max, `${what}: máximo ${max}.`));

const taxSchema = z.object({
  responsible: z.string().optional(),
  rate: num(0, 100, "La tarifa de IVA"),
});

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Revisa los valores.";

/** Configuración fiscal (solo administración; la BD valida los valores y audita el cambio). No toca ningún precio existente. Responde junto al botón. */
export async function saveTaxAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole(["superadmin"]);
  const p = taxSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const supabase = await createClient();
  const a = await supabase.from("app_settings").update({ value: p.data.responsible === "on" }).eq("key", "tax.vat_responsible");
  const b = await supabase.from("app_settings").update({ value: p.data.rate }).eq("key", "tax.vat_rate");
  if (a.error || b.error) return { ok: false, error: "No pudimos guardar el IVA. Inténtalo de nuevo." };
  await auditAdmin(actor.id, "superadmin.settings_changed", undefined, { setting: "tax" });
  revalidatePath("/b/comercial");
  return { ok: true, message: "Configuración de IVA guardada." };
}

const time = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "La hora debe tener el formato HH:MM.")
  .or(z.literal(""));
const urgencySchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(3, "El nombre necesita al menos 3 letras.").max(60, "El nombre es demasiado largo."),
  percent: num(0, 300, "El porcentaje"),
  fixed: num(0, 100_000_000, "El valor fijo"),
  min: num(0, 100_000_000, "El mínimo"),
  start: time,
  end: time,
  active: z.string().optional(),
});

/** Nivel de urgencia: porcentaje, valor fijo, mínimo, horario, días, modalidades y servicios a los que aplica. Responde junto al botón. */
export async function saveUrgencyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole(["superadmin"]);
  const p = urgencySchema.safeParse(Object.fromEntries(fd.entries()));
  const days = fd.getAll("days").map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  const modalities = fd.getAll("modalities").map(String).filter((m): m is "store" | "pickup" | "home" | "remote" => ["store", "pickup", "home", "remote"].includes(m));
  const services = fd.getAll("services").map(String).filter((s) => z.string().uuid().safeParse(s).success);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  if (days.length === 0) return { ok: false, error: "Marca al menos un día." };
  if (modalities.length === 0) return { ok: false, error: "Marca al menos una modalidad." };
  if ((p.data.start === "") !== (p.data.end === "")) return { ok: false, error: "Completa «desde» y «hasta», o deja ambas horas vacías." };
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
  if (error || !data?.length) return { ok: false, error: "No pudimos guardar el nivel. Revisa los valores e inténtalo de nuevo." };
  await supabase.from("urgency_level_services").delete().eq("level_id", v.id);
  if (services.length) await supabase.from("urgency_level_services").insert(services.map((service_id) => ({ level_id: v.id, service_id })));
  await auditAdmin(actor.id, "superadmin.settings_changed", undefined, { setting: "urgency" });
  revalidatePath("/b/comercial");
  return { ok: true, message: "Nivel guardado." };
}
