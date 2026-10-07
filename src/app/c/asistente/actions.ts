"use server";

import { z } from "zod";
import { generateJson } from "@/lib/ai/llm";
import { allow } from "@/lib/auth/rate-limit";
import { assertRole } from "@/lib/auth/session";
import { MAX_MESSAGE, routeAssistantRequest, type AssistantReply } from "@/lib/assistant/router";
import { recordAssistantUsage } from "@/lib/assistant/usage";
import { createClient } from "@/lib/supabase/server";

export type AskResult = { ok: true; reply: AssistantReply } | { ok: false; error: string };
const schema = z.object({ message: z.string().trim().min(1).max(MAX_MESSAGE) });

/**
 * Asistente TechnoUltra. Solo clientes con sesión. Todo pasa por `routeAssistantRequest` (datos propios → reglas → FAQ → IA → respaldo).
 * La IA no recibe herramientas ni acceso a la base de datos: el contexto lo arma el servidor con lo mínimo necesario.
 */
export async function askAssistantAction(input: unknown): Promise<AskResult> {
  const profile = await assertRole(["client"]);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Escribe tu consulta (máximo 500 caracteres)." };
  if (!(await allow("assistant-user", profile.id, 30, 600))) return { ok: false, error: "Hiciste muchas consultas seguidas. Espera unos minutos e inténtalo de nuevo." };
  try {
    const reply = await routeAssistantRequest(parsed.data, {
      db: await createClient(),
      ai: generateJson,
      allowAi: () => allow("assistant-ai", profile.id, 12, 3600), // control de costo: máximo 12 consultas con IA por hora y persona
      record: (u) => recordAssistantUsage(profile.id, u),
    });
    return { ok: true, reply };
  } catch (e) {
    console.error("assistant.action", (e as Error).message?.slice(0, 80));
    return { ok: false, error: "El asistente no está disponible ahora. Puedes continuar manualmente." };
  }
}
