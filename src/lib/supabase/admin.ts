import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env.public";
import { serverEnv } from "@/lib/env.server";

/**
 * Cliente con service_role: OMITE RLS. Solo para operaciones que el servidor ya autorizó
 * (provisionar personal, límites de intentos, webhooks). Nunca debe recibir identidades desde el navegador.
 */
export function createAdminClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv.supabase();
  return createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
