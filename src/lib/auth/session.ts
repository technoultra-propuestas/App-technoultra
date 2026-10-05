import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole, roleHome } from "@/lib/auth/routes";
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

/**
 * Nivel de aseguramiento de la sesión (aal1 = solo contraseña/enlace; aal2 = segundo factor TOTP verificado).
 * Sale del JWT con la FIRMA verificada (getClaims), emitido por Supabase Auth: el navegador no puede declararse aal2.
 */
export const getAal = cache(async (): Promise<{ aal: "aal1" | "aal2"; amr: string[] }> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { aal?: string; amr?: { method?: string }[] } | undefined;
  return { aal: claims?.aal === "aal2" ? "aal2" : "aal1", amr: (claims?.amr ?? []).map((a) => String(a.method)) };
});

/**
 * Exige sesión y rol permitido; si no, redirige. Úsalo en cada layout/página protegida.
 * El personal (técnico/admin) además necesita MFA completado (aal2): sin él va a /gestion/mfa.
 */
export async function requireRole(allowed: AppRole[]): Promise<Profile> {
  const staffOnly = allowed.every(isStaffRole);
  const profile = await getProfile();
  if (!profile) redirect(staffOnly ? "/gestion/login" : "/login");
  if (!profile.is_active) redirect(staffOnly || isStaffRole(profile.role) ? "/gestion/login?error=inactive" : "/login?error=inactive");
  if (!allowed.includes(profile.role)) redirect(roleHome(profile.role));
  if (isStaffRole(profile.role) && (await getAal()).aal !== "aal2") redirect("/gestion/mfa");
  return profile;
}

/** Personal autenticado SIN exigir aal2 (solo para las pantallas de MFA y de restablecer contraseña). */
export async function requireStaffSession(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/gestion/login");
  if (!profile.is_active) redirect("/gestion/login?error=inactive");
  if (!isStaffRole(profile.role)) redirect(roleHome(profile.role));
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
  // Acciones de personal: sin MFA completado (aal2) no hay autorización, aunque el rol sea correcto.
  if (isStaffRole(profile.role) && (await getAal()).aal !== "aal2") throw new AuthorizationError(401);
  return profile;
}

/** Para Server Actions de personal que NO exigen aún aal2 (inscribir/verificar MFA, restablecer contraseña). */
export async function assertStaffSession(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile || !profile.is_active) throw new AuthorizationError(401);
  if (!isStaffRole(profile.role)) throw new AuthorizationError(403);
  return profile;
}

/** ¿La sesión nació de un enlace de correo (recuperación/invitación) y no de contraseña ni de Google? */
export const isEmailLinkSession = (amr: string[]) => !amr.includes("password") && !amr.includes("oauth");
