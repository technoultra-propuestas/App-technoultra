import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Patch = { email_enabled?: boolean; push_enabled?: boolean };

/**
 * Guarda una preferencia del PROPIO usuario con su sesión (RLS). No usa `upsert`: la API solo permite actualizar las columnas de canal
 * (no `profile_id`), y un upsert intentaría reescribir `profile_id` y sería rechazado. Primero actualiza; si aún no hay fila, la crea.
 */
export async function setPreference(supabase: SupabaseClient<Database>, profileId: string, patch: Patch): Promise<boolean> {
  const update = () => supabase.from("notification_preferences").update(patch).eq("profile_id", profileId).select("profile_id");
  const first = await update();
  if (first.error) return false;
  if (first.data.length > 0) return true;
  const ins = await supabase.from("notification_preferences").insert({ profile_id: profileId, ...patch });
  if (!ins.error) return true;
  const again = await update(); // otra petición pudo crear la fila entre medias
  return !again.error && again.data.length > 0;
}
