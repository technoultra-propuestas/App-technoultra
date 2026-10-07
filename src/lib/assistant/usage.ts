import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UsageRecord } from "./router";

/** Métricas de uso (ruta, tema, proveedor, modelo, tokens, latencia, error). NUNCA se guarda el texto de la conversación. */
export async function recordAssistantUsage(profileId: string, u: UsageRecord): Promise<void> {
  const { error } = await createAdminClient().from("ai_usage").insert({
    profile_id: profileId,
    route: u.route,
    topic: u.topic?.slice(0, 40) ?? null,
    provider: u.provider ?? null,
    model: u.model?.slice(0, 80) ?? null,
    tokens_input: u.tokensInput ?? null,
    tokens_output: u.tokensOutput ?? null,
    latency_ms: u.latencyMs !== undefined ? Math.max(0, Math.round(u.latencyMs)) : null,
    error: u.error?.slice(0, 60) ?? null,
  });
  if (error) console.error("assistant.usage", error.code);
}
