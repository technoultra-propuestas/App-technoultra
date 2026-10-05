"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { allow, clientIp, TOO_MANY } from "@/lib/auth/rate-limit";
import { emailOnlySchema, newPasswordSchema, otpCode, signInSchema, zodToState, type ActionState } from "@/lib/auth/schemas";
import { NEXT_COOKIE, safeNext } from "@/lib/auth/routes";
import { assertStaffSession, getAal, isEmailLinkSession } from "@/lib/auth/session";
import { getPublicEnv } from "@/lib/env.public";
import { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;
const form = (fd: FormData) => Object.fromEntries(fd.entries());
const GENERIC = "Correo o contraseña incorrectos.";

/** Auditoría de accesos del personal (lista cerrada en BD; nunca se envían contraseñas, códigos ni tokens). */
async function audit(supabase: Supa, event: string, method?: string) {
  const { error } = await supabase.rpc("log_staff_event", { p_event: event, p_metadata: method ? { method } : {} });
  if (error) console.error("staff.audit", event, error.code);
}

/** Destino posterior: solo rutas internas de gestión. */
const staffNext = (raw: unknown) => {
  const n = safeNext(typeof raw === "string" ? raw : "", "/b");
  return n === "/b" || n.startsWith("/b/") ? n : "/b";
};
const mfaUrl = (next: string) => (next === "/b" ? "/gestion/mfa" : `/gestion/mfa?next=${encodeURIComponent(next)}`);

// ---------------------------------------------------------------- 1) contraseña
export async function staffSignInAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(form(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const { email, password } = parsed.data;
  const next = staffNext(fd.get("next"));
  if (!(await allow("staff-login-ip", await clientIp(), 20, 600)) || !(await allow("staff-login-email", email, 6, 600))) {
    return { ok: false, error: TOO_MANY };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, error: GENERIC };
  const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { ok: false, error: GENERIC };
  }
  if (profile.role === "client") {
    // Un cliente no entra a gestión: se cierra la sesión creada y se le indica el acceso correcto (sin detallar roles).
    await supabase.auth.signOut();
    return { ok: false, error: "Este acceso es solo para personal autorizado. Si eres cliente, ingresa desde el acceso de clientes." };
  }
  await audit(supabase, "staff.login", "password");
  redirect(mfaUrl(next));
}

// ---------------------------------------------------------------- 2) MFA TOTP (Supabase Auth es la autoridad)
export type EnrollState = ActionState & { enroll?: { factorId: string; qr: string; secret: string; uri: string } };

/** Crea el factor TOTP en Supabase y devuelve QR/secreto SOLO a esta respuesta (no se guardan en ninguna tabla nuestra). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- firma de useActionState (estado, formulario)
export async function startEnrollmentAction(_p: EnrollState, _fd: FormData): Promise<EnrollState> {
  const profile = await assertStaffSession();
  if (!(await allow("mfa-enroll", profile.id, 6, 3600))) return { ok: false, error: TOO_MANY };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if ((factors?.totp ?? []).some((f) => f.status === "verified")) {
    return { ok: false, error: "Ya tienes un autenticador configurado." };
  }
  // limpia intentos de inscripción abandonados
  for (const f of factors?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Autenticador TechnoUltra", issuer: "TechnoUltra" });
  if (error || !data) {
    console.error("staff.mfa.enroll", error?.status, error?.code);
    return { ok: false, error: "No pudimos iniciar la configuración. Inténtalo de nuevo." };
  }
  return { ok: true, enroll: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri } };
}

const verifyEnrollSchema = z.object({ factorId: z.string().uuid(), code: otpCode });
export async function verifyEnrollmentAction(_p: EnrollState, fd: FormData): Promise<EnrollState> {
  const profile = await assertStaffSession();
  const parsed = verifyEnrollSchema.safeParse(form(fd));
  if (!parsed.success) return { ok: false, error: "Escribe el código de 6 dígitos de tu aplicación." };
  if (!(await allow("mfa-verify", profile.id, 8, 600))) return { ok: false, error: TOO_MANY };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
  if (error) {
    await audit(supabase, "staff.mfa_failure", "totp");
    return { ok: false, error: "El código no es correcto o ya venció. Revisa la hora de tu teléfono e inténtalo de nuevo." };
  }
  await audit(supabase, "staff.mfa_enroll", "totp");
  await audit(supabase, "staff.mfa_success", "totp");
  redirect(staffNext(fd.get("next")));
}

/** Segundo factor en cada inicio de sesión (y antes de restablecer contraseña con MFA inscrito). */
export async function verifyChallengeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const profile = await assertStaffSession();
  const parsed = z.object({ code: otpCode }).safeParse(form(fd));
  if (!parsed.success) return { ok: false, error: "Escribe el código de 6 dígitos de tu aplicación." };
  if (!(await allow("mfa-verify", profile.id, 8, 600))) return { ok: false, error: TOO_MANY };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (!factor) redirect("/gestion/mfa");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data.code });
  if (error) {
    await audit(supabase, "staff.mfa_failure", "totp");
    return { ok: false, error: "El código no es correcto o ya venció." };
  }
  await audit(supabase, "staff.mfa_success", "totp");
  const rawNext = fd.get("next");
  redirect(rawNext === "/gestion/restablecer" ? "/gestion/restablecer" : staffNext(rawNext));
}

// ---------------------------------------------------------------- 3) recuperación de contraseña (personal)
/** El enlace vuelve al callback exacto; el destino viaja en cookie. Respuesta idéntica exista o no la cuenta (anti-enumeración). */
export async function staffRequestRecoveryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = emailOnlySchema.safeParse(form(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const { email } = parsed.data;
  if (!(await allow("staff-reset-email", email, 3, 3600)) || !(await allow("staff-reset-ip", await clientIp(), 10, 3600))) {
    return { ok: false, error: TOO_MANY };
  }
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;
  (await cookies()).set(NEXT_COOKIE, "/gestion/restablecer", { httpOnly: true, sameSite: "lax", secure: appUrl.startsWith("https://"), path: "/auth", maxAge: 3600 });
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl}/auth/callback` });
  if (error) console.error("staff.reset", error.status, error.code);
  redirect("/gestion/recuperar?enviado=1");
}

/**
 * Nueva contraseña tras el enlace de recuperación/invitación. Reglas: la sesión debe venir de un enlace de correo (no de una
 * sesión normal de contraseña: para eso existe «Cambiar contraseña» con reautenticación) y, si ya hay MFA, debe estar en aal2.
 */
export async function staffResetPasswordAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const profile = await assertStaffSession();
  const parsed = newPasswordSchema.safeParse(form(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const { aal, amr } = await getAal();
  if (!isEmailLinkSession(amr)) {
    return { ok: false, error: "Este enlace ya no es válido. Pide uno nuevo desde «¿Olvidaste tu contraseña?»." };
  }
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasMfa = (factors?.totp ?? []).some((f) => f.status === "verified");
  if (hasMfa && aal !== "aal2") return { ok: false, error: "Primero verifica tu autenticador." };
  if (!(await allow("staff-pwd-reset", profile.id, 5, 3600))) return { ok: false, error: TOO_MANY };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.error("staff.reset.update", error.status, error.code);
    return { ok: false, error: "No pudimos guardar la contraseña. Prueba con otra." };
  }
  await supabase.auth.signOut({ scope: "others" });
  await audit(supabase, "staff.password_reset", "recovery");
  await audit(supabase, "staff.session_revoked", "others");
  redirect("/gestion/mfa");
}
