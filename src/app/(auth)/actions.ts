"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { allow, clientIp, TOO_MANY } from "@/lib/auth/rate-limit";
import { getPublicEnv } from "@/lib/env.public";
import { roleHome, safeNext } from "@/lib/auth/routes";
import {
  emailOnlySchema,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
  verifyOtpSchema,
  zodToState,
  type ActionState,
} from "@/lib/auth/schemas";

const GENERIC_AUTH_ERROR = "Correo o contraseña incorrectos.";
const GENERIC_SEND = "No pudimos procesar la solicitud. Inténtalo de nuevo en unos minutos.";

const form = (fd: FormData) => Object.fromEntries(fd.entries());

/** Registro de cliente: Supabase envía un código de 6 dígitos al correo (generado, limitado y con expiración en Auth). */
export async function signUpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(form(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const { email, password, fullName } = parsed.data;

  const ip = await clientIp();
  if (!(await allow("signup-ip", ip, 10, 3600)) || !(await allow("signup-email", email, 5, 3600))) {
    return { ok: false, error: TOO_MANY };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  // Un correo ya registrado NO se revela (anti-enumeración): se responde igual que un alta nueva.
  if (error && !/already|registered/i.test(error.message)) {
    console.error("auth.signUp", error.status, error.code);
    return { ok: false, error: GENERIC_SEND };
  }
  redirect(`/verificar?${new URLSearchParams({ email, mode: "signup" })}`);
}

/** Verifica el código real (un solo uso, expira a los 10 min). Crea la sesión al acertar. */
export async function verifyOtpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const mode = fd.get("mode") === "recovery" ? "recovery" : "signup";
  const parsed = verifyOtpSchema.safeParse(form(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const { email, token } = parsed.data;

  const ip = await clientIp();
  if (!(await allow("otp-email", email, 6, 900)) || !(await allow("otp-ip", ip, 30, 900))) {
    return { ok: false, error: TOO_MANY };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: mode === "recovery" ? "recovery" : "email",
  });
  if (error) return { ok: false, error: "El código no es válido o ya venció. Pide uno nuevo." };
  redirect(mode === "recovery" ? "/restablecer" : "/");
}

export async function resendCodeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const mode = fd.get("mode") === "recovery" ? "recovery" : "signup";
  const parsed = emailOnlySchema.safeParse(form(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const { email } = parsed.data;
  if (
    !(await allow("resend-email", email, 3, 600)) ||
    !(await allow("resend-ip", await clientIp(), 10, 600))
  ) {
    return { ok: false, error: TOO_MANY };
  }
  const supabase = await createClient();
  const { error } =
    mode === "recovery"
      ? await supabase.auth.resetPasswordForEmail(email)
      : await supabase.auth.resend({ type: "signup", email });
  if (error) console.error("auth.resend", error.status, error.code);
  return { ok: true, message: "Si el correo es válido, te enviamos un código nuevo." };
}

export async function signInAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(form(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const { email, password } = parsed.data;
  const next = safeNext(String(fd.get("next") ?? ""), "");

  const ip = await clientIp();
  if (!(await allow("login-ip", ip, 30, 600)) || !(await allow("login-email", email, 8, 600))) {
    return { ok: false, error: TOO_MANY };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") {
      redirect(`/verificar?${new URLSearchParams({ email, mode: "signup" })}`);
    }
    return { ok: false, error: GENERIC_AUTH_ERROR };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { ok: false, error: "Esta cuenta está desactivada. Habla con administración." };
  }
  redirect(next || roleHome(profile.role));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = emailOnlySchema.safeParse(form(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const { email } = parsed.data;
  if (
    !(await allow("reset-email", email, 3, 3600)) ||
    !(await allow("reset-ip", await clientIp(), 10, 3600))
  ) {
    return { ok: false, error: TOO_MANY };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) console.error("auth.reset", error.status, error.code);
  // Respuesta idéntica exista o no la cuenta.
  redirect(`/verificar?${new URLSearchParams({ email, mode: "recovery" })}`);
}

/** Requiere la sesión de recuperación creada al verificar el código. */
export async function updatePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse(form(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Tu sesión venció. Vuelve a pedir el código." };
  if (!(await allow("pwd-user", auth.user.id, 5, 3600))) return { ok: false, error: TOO_MANY };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "No pudimos guardar la contraseña. Prueba con otra." };
  await supabase.auth.signOut({ scope: "others" });
  redirect("/");
}
