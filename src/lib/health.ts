import "server-only";
import { reportActionError } from "@/lib/observability";
import { createPublicClient } from "@/lib/supabase/public";

let last: { at: number; ok: boolean } | null = null;
const TTL_MS = 30_000;

/**
 * Latido de SOLO LECTURA: lee una fila de ajustes públicos (RLS de `anon`). No escribe nada ni toca datos de personas.
 * Mantiene activo el proyecto de Supabase (el plan gratuito lo pausa tras ~7 días sin actividad) y detecta si la base no responde:
 * en ese caso deja el error depurado en los registros y en Sentry. El resultado se reutiliza 30 s para que nadie pueda usar la ruta
 * pública como amplificador de consultas.
 */
export async function checkDatabase(now = Date.now()): Promise<boolean> {
  if (last && now - last.at < TTL_MS) return last.ok;
  let ok = false;
  try {
    const { error } = await createPublicClient().from("app_settings").select("key").limit(1);
    ok = !error;
    if (error) await reportActionError("health.database", error);
  } catch (e) {
    await reportActionError("health.database", e);
  }
  last = { at: now, ok };
  return ok;
}
