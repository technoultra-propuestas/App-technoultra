"use server";

import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { allow } from "@/lib/auth/rate-limit";
import { findRelatedProducts, type RelatedProduct } from "@/lib/ai/related-products";
import type { ActionState } from "@/lib/auth/schemas";
import { basicDiagnosis, buildUserPrompt, DEFAULT_DISCLAIMER, parseModelOutput, PROMPT_VERSION, SYSTEM_PROMPT, type AiOutput } from "@/lib/ai/diagnosis";
import { generateJson } from "@/lib/ai/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AiPreviewState = ActionState & {
  aiId?: string;
  disclaimer?: string;
  source?: "ai" | "basic";
  result?: { summary: string; causes: AiOutput["causes"]; urgency: AiOutput["urgency"]; recommendations: { name: string; reason: string }[]; products: RelatedProduct[] };
};

/** Memoria de 10 min por persona y consulta idéntica: evita gastar IA cuando el texto no cambió (no guarda nada de otras personas). */
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; state: AiPreviewState }>();
const cacheKey = (profileId: string, service: string, equipment: string, problem: string) => `${profileId}|${service}|${equipment}|${problem.trim().toLowerCase().replace(/\s+/g, " ")}`;

const schema = z.object({
  serviceId: z.string().uuid(),
  equipmentId: z.union([z.literal(""), z.string().uuid()]).optional(),
  problem: z.string().trim().min(5, "Cuéntanos qué pasa (mínimo 5 caracteres).").max(2000),
});

/**
 * Diagnóstico PRELIMINAR. Se ejecuta solo en el servidor (la clave del proveedor de IA nunca llega al navegador), con límite de uso,
 * salida validada contra un esquema cerrado y el aviso obligatorio añadido por el servidor (no por el modelo).
 */
export async function previewDiagnosisAction(_p: AiPreviewState, fd: FormData): Promise<AiPreviewState> {
  const profile = await assertRole(["client"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  const key = cacheKey(profile.id, v.serviceId, v.equipmentId ?? "", v.problem);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.state;
  if (!(await allow("ai-preview", profile.id, 10, 3600))) return { ok: false, error: "Ya generamos varios análisis seguidos. Puedes continuar con tu solicitud; el técnico revisará todo." };

  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("id").eq("profile_id", profile.id).is("deleted_at", null).maybeSingle();
  if (!customer) return { ok: false, error: "No encontramos tu ficha de cliente." };
  const { data: service } = await supabase.from("services").select("id, name").eq("id", v.serviceId).maybeSingle();
  if (!service) return { ok: false, error: "Ese servicio no está disponible." };
  const equipment = v.equipmentId
    ? (await supabase.from("equipment").select("type, brand, model, year, ram, storage").eq("id", v.equipmentId).maybeSingle()).data
    : null;

  // Solo SERVICIOS como candidatos de la IA. Los productos se sugieren con reglas deterministas (no se inventa compatibilidad).
  const { data: svcs } = await supabase.from("services").select("id, name").eq("is_active", true).eq("kind", "technical").limit(60);
  const catalog = (svcs ?? []) as { id: string; name: string }[];
  const names = new Map(catalog.map((c) => [c.id, c.name]));

  const input = { service: service.name as string, equipment, problem: v.problem };
  const gen = await generateJson(SYSTEM_PROMPT, buildUserPrompt(input, catalog));
  let output = gen.ok ? parseModelOutput(gen.text, catalog) : null;
  const source: "ai" | "basic" = output ? "ai" : "basic";
  if (!output) output = basicDiagnosis(v.problem);

  const { data: row, error } = await createAdminClient()
    .from("ai_diagnostics")
    .insert({
      customer_id: customer.id,
      model: gen.ok && source === "ai" ? gen.model : "basic-rules",
      model_version: null,
      prompt_version: PROMPT_VERSION,
      input: { service: service.name, equipment, problem: v.problem },
      output,
      urgency: output.urgency,
      disclaimer: DEFAULT_DISCLAIMER,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: "No pudimos generar el diagnóstico en este momento." };

  const products = await findRelatedProducts(v.problem, output.causes.map((c) => c.text)).catch(() => []);
  const state: AiPreviewState = {
    ok: true,
    aiId: row.id,
    source,
    disclaimer: DEFAULT_DISCLAIMER,
    result: {
      summary: output.summary,
      causes: output.causes,
      urgency: output.urgency,
      recommendations: output.recommendations.map((r) => ({ name: names.get(r.id) ?? "Servicio", reason: r.reason })),
      products,
    },
  };
  cache.set(key, { at: Date.now(), state });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return state;
}
