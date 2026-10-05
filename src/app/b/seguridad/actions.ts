"use server";

import { revalidatePath } from "next/cache";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { z } from "zod";
import { allow, TOO_MANY } from "@/lib/auth/rate-limit";
import { otpCode, password, zodToState, type ActionState } from "@/lib/auth/schemas";
import { assertRole } from "@/lib/auth/session";
import { getPublicEnv } from "@/lib/env.public";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({ current: z.string().min(1, "Escribe tu contraseña actual.").max(72), password, confirm: z.string(), code: otpCode })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden.", path: ["confirm"] })
  .refine((v) => v.password !== v.current, { message: "La contraseña nueva debe ser distinta a la actual.", path: ["password"] });

async function audit(supabase: Awaited<ReturnType<typeof createClient>>, event: string, method?: string) {
  const { error } = await supabase.rpc("log_staff_event", { p_event: event, p_metadata: method ? { method } : {} });
  if (error) console.error("staff.audit", event, error.code);
}

/**
 * Cambio de contraseña del personal con reautenticación: sesión aal2 + contraseña actual + código TOTP vigente. La contraseña la
 * guarda únicamente Supabase Auth (nunca nuestras tablas ni logs). Al terminar se revocan las demás sesiones.
 */
export async function changePasswordAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole(["technician", "superadmin"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  if (!(await allow("staff-pwd-change", actor.id, 5, 3600))) return { ok: false, error: TOO_MANY };

  const supabase = await createClient();
  // 1) segundo factor reciente
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (!factor) return { ok: false, error: "Configura tu autenticador antes de cambiar la contraseña." };
  const mfa = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: v.code });
  if (mfa.error) {
    await audit(supabase, "staff.mfa_failure", "totp");
    return { ok: false, fieldErrors: { code: "El código no es correcto o ya venció." } };
  }
  // 2) contraseña actual, verificada con un cliente SIN estado (no toca las cookies ni la sesión vigente)
  const env = getPublicEnv();
  const probe = createStatelessClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const re = await probe.auth.signInWithPassword({ email: actor.email, password: v.current });
  if (re.error) return { ok: false, fieldErrors: { current: "La contraseña actual no es correcta." } };
  await probe.auth.signOut({ scope: "local" }); // solo esa sesión de verificación
  // 3) cambio mediante Supabase Auth y revocación de las demás sesiones
  const up = await supabase.auth.updateUser({ password: v.password });
  if (up.error) {
    console.error("staff.pwd.update", up.error.status, up.error.code);
    return { ok: false, error: "No pudimos guardar la contraseña. Prueba con otra." };
  }
  await supabase.auth.signOut({ scope: "others" });
  await audit(supabase, "staff.password_changed", "reauth_totp");
  await audit(supabase, "staff.session_revoked", "others");
  revalidatePath("/b/seguridad");
  return { ok: true, message: "Contraseña actualizada. Cerramos tus otras sesiones." };
}

/** Cierra la sesión en todos los demás dispositivos (la actual se mantiene). */
export async function revokeOtherSessionsAction(): Promise<void> {
  await assertRole(["technician", "superadmin"]);
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) console.error("staff.revoke", error.status);
  else await audit(supabase, "staff.session_revoked", "others");
  revalidatePath("/b/seguridad");
}
