import "server-only";
import type { Zone } from "@/lib/domain/delivery";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Physical = "store" | "pickup" | "home";

/**
 * Zona de cada dirección: cobertura por modalidad (función `check_coverage` de la base de datos) y tarifas del municipio (`coverage_areas`).
 * Es ayuda para mostrar el valor ANTES de enviar; la validación real de cobertura y el cálculo del cobro los repite el servidor al crear la
 * solicitud y la cotización: nada de esto lo decide el navegador.
 */
export async function loadZones(supabase: Supabase, danes: string[], modalities: string[]): Promise<Map<string, Zone>> {
  const unique = [...new Set(danes)];
  const physical = modalities.filter((m): m is Physical => m === "store" || m === "pickup" || m === "home");
  const { data: areas } = unique.length
    ? await supabase.from("coverage_areas").select("dane_code, city_name, home_fee, pickup_fee").in("dane_code", unique).eq("is_active", true)
    : { data: [] };
  const byDane = new Map((areas ?? []).map((a) => [a.dane_code, a]));
  const zones = new Map<string, Zone>();
  for (const dane of unique) {
    const covered: Record<string, boolean> = {};
    for (const m of physical) {
      const { data } = await supabase.rpc("check_coverage", { p_dane_code: dane, p_modality: m });
      covered[m] = data === true;
    }
    const area = byDane.get(dane);
    zones.set(dane, { dane, city: area?.city_name ?? "", covered, homeFee: Number(area?.home_fee ?? 0), pickupFee: Number(area?.pickup_fee ?? 0) });
  }
  return zones;
}
