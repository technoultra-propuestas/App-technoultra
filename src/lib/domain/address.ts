import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  line1: z.string().trim().min(3, "Escribe tu dirección.").max(160),
  neighborhood: z.string().trim().max(100).optional(),
  dane: z.string().regex(/^[0-9]{5}$|^other$/, "Elige tu ciudad."),
  otherCity: z.string().trim().max(80).optional(),
  otherDept: z.string().trim().max(80).optional(),
});
export type AddressInput = z.infer<typeof addressSchema>;

/**
 * Resuelve ciudad/departamento/DANE desde la tabla de cobertura (no desde el navegador).
 * "Otra ciudad" se guarda con DANE 00000: sin cobertura presencial, solo soporte remoto.
 */
export async function resolveAddressPlace(
  supabase: Supabase,
  v: Pick<AddressInput, "dane" | "otherCity" | "otherDept">,
): Promise<
  { ok: true; city_name: string; department: string; dane_code: string } | { ok: false; error: string }
> {
  if (v.dane === "other") {
    if (!v.otherCity || v.otherCity.length < 2 || !v.otherDept || v.otherDept.length < 2) {
      return { ok: false, error: "Escribe tu ciudad y departamento." };
    }
    return { ok: true, city_name: v.otherCity, department: v.otherDept, dane_code: "00000" };
  }
  const { data: area } = await supabase
    .from("coverage_areas")
    .select("city_name, department, dane_code")
    .eq("dane_code", v.dane)
    .eq("is_active", true)
    .maybeSingle();
  if (!area) return { ok: false, error: "Elige una ciudad de la lista." };
  return { ok: true, ...(area as { city_name: string; department: string; dane_code: string }) };
}
