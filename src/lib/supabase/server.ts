import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env.public";
import type { Database } from "./database.types";

/** Cliente con la sesión del usuario (cookies httpOnly). Todas las consultas pasan por RLS. */
export async function createClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Llamado desde un Server Component: el proxy ya refresca la sesión.
        }
      },
    },
  });
}
