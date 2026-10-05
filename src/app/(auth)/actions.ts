"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { allow, clientIp, TOO_MANY } from "@/lib/auth/rate-limit";
import { getPublicEnv } from "@/lib/env.public";
import { NEXT_COOKIE, roleHome, safeNext } from "@/lib/auth/routes";
import {
  emailOnlySchema,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
  zodToState,
  type ActionState,
} from "@/lib/auth/schemas";

const GENERIC_AUTH_ERROR = "Correo o contraseña incorrectos.";
const GENERIC_SEND = "No pudimos procesar la solicitud. Inténtalo de nuevo en unos minutos.";

const form = (fd: FormData) => Object.fromEntries(fd.entries());

/** Recuperación: el enlace vuelve a /auth/callback (URL exacta permitida en Supabase) y el destino viaja en una cookie corta. */
async function sendRecoveryEmail(email: string) {
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;
  (await cookies()).set(NEXT_COOKIE, "/restablecer", { httpOnly: true, sameSite: "lax", secure: appUrl.startsWith("https://"), path: "/auth", maxAge: 3600 });
  return (await createClient()).auth.resetPasswordForEmail(email, { redirectTo: `${appUrl}/auth/callback` });
}

/** Registro de cliente: Supabase envía un correo con un ENLACE de confirmación que vuelve a /auth/callback (PKCE). */
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

export async function resendEmailAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
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
  const { error } =
    mode === "recovery"
      ? await sendRecoveryEmail(email)
      : await (await createClient()).auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/auth/callback` },
        });
  if (error) console.error("auth.resend", error.status, error.code);
  // Respuesta idéntica exista o no la cuenta (anti-enumeración).
  return { ok: true, message: "Si el correo es válido, te enviamos un correo nuevo." };
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
  const { error } = await sendRecoveryEmail(email);
  if (error) console.error("auth.reset", error.status, error.code);
  // Respuesta idéntica exista o no la cuenta.
  redirect(`/verificar?${new URLSearchParams({ email, mode: "recovery" })}`);
}

/** Requiere la sesión de recuperación creada al abrir el enlace del correo. */
export async function updatePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse(form(fd));
  if (!parsed.success) return zodToState(parsed.error);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Tu sesión venció. Vuelve a pedir el enlace." };
  if (!(await allow("pwd-user", auth.user.id, 5, 3600))) return { ok: false, error: TOO_MANY };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "No pudimos guardar la contraseña. Prueba con otra." };
  await supabase.auth.signOut({ scope: "others" });
  redirect("/");
}
