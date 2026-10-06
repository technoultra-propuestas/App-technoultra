import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env.public";
import type { Database } from "./database.types";

/** Cliente anónimo sin cookies: solo para contenido público (catálogo, cobertura, textos legales). Sujeto a RLS de `anon`. */
export function createPublicClient() {
  const env = getPublicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
