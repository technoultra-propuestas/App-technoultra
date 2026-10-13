import { serverEnv } from "@/lib/env.server";
import { scheduleFlushThrottled } from "@/lib/email/outbox";
import { createClient } from "@/lib/supabase/server";
import { PushPrompt } from "./PushPrompt";

/**
 * Componente de servidor para los layouts con sesión: lee la preferencia REAL del usuario y la clave pública VAPID (no es un secreto) y,
 * como respaldo, programa el envío de avisos pendientes (limitado en el tiempo) por si alguna acción no lo disparó.
 */
export async function PushBootstrap({ profileId }: { profileId: string }) {
  scheduleFlushThrottled();
  const publicKey = serverEnv.push()?.VAPID_PUBLIC_KEY ?? null;
  if (!publicKey) return null;
  const { data } = await (await createClient()).from("notification_preferences").select("push_enabled").eq("profile_id", profileId).maybeSingle();
  return <PushPrompt publicKey={publicKey} pushEnabled={Boolean(data?.push_enabled)} />;
}
