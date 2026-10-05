import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/routes";
import type { AppRole, Profile } from "@/lib/auth/types";

/** Usuario autenticado, validado contra el servidor de Auth (no se confía en la cookie sin verificar). */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
});

/** Perfil leído de la base de datos (fuente de verdad del rol). Nunca desde el JWT ni metadatos. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, role, email, full_name, avatar_url, is_active, onboarding_completed_at, onboarding_step")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
});

/** Exige sesión y rol permitido; si no, redirige. Úsalo en cada layout/página protegida. */
export async function requireRole(allowed: AppRole[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/login?error=inactive");
  if (!allowed.includes(profile.role)) redirect(roleHome(profile.role));
  return profile;
}

/** Para Server Actions / Route Handlers: lanza en vez de redirigir. */
export class AuthorizationError extends Error {
  constructor(public status: 401 | 403 = 403) {
    super(status === 401 ? "unauthenticated" : "forbidden");
  }
}
export async function assertRole(allowed: AppRole[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile || !profile.is_active) throw new AuthorizationError(401);
  if (!allowed.includes(profile.role)) throw new AuthorizationError(403);
  return profile;
}
