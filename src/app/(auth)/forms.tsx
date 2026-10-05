"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { GoogleG, IconBadge } from "@/components/ui/icons";
import { initialState } from "@/lib/auth/schemas";
import {
  requestPasswordResetAction,
  resendEmailAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
} from "./actions";

const linkCls = "font-extrabold text-ink underline decoration-brand underline-offset-[3px]";

export function GoogleButton({ next }: { next?: string }) {
  const href = next ? `/auth/google?next=${encodeURIComponent(next)}` : "/auth/google";
  return (
    <a
      href={href}
      className="flex min-h-[58px] items-center justify-center gap-3 rounded-2xl border-[1.5px] border-line-strong bg-white text-[17px] font-extrabold text-ink no-underline"
    >
      <GoogleG />
      Continuar con Google
    </a>
  );
}

export function LoginForm({
  next,
  notice,
}: {
  next?: string;
  notice?: string;
}) {
  const [state, action] = useActionState(signInAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {notice ? <Alert>{notice}</Alert> : null}
      <Field
        label="Correo"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="username"
        required
        error={state.fieldErrors?.email}
      />
      <Field
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <Link
        href="/recuperar"
        className="flex min-h-11 w-fit items-center text-[15px] font-bold underline decoration-brand underline-offset-[3px]"
      >
        ¿Olvidaste tu contraseña?
      </Link>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
      <Link href="/gestion/login" className="flex min-h-11 w-fit items-center text-[13px] font-semibold text-muted underline decoration-line-strong underline-offset-[3px]">
        ¿Eres del equipo? Acceso de personal
      </Link>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(signUpAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <Field
        label="Nombre completo"
        name="fullName"
        autoComplete="name"
        required
        error={state.fieldErrors?.fullName}
      />
      <Field
        label="Correo"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />
      <Field
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="Mínimo 10 caracteres, con mayúscula, minúscula y número."
        error={state.fieldErrors?.password}
      />
      <label className="flex items-start gap-3 py-1.5 text-[15px] font-semibold leading-[1.4]">
        <input type="checkbox" name="terms" className="mt-0.5 h-6 w-6 flex-none accent-[#FF8A00]" required />
        <span>
          Acepto los{" "}
          <Link href="/legal/terms" target="_blank" className={linkCls}>
            términos
          </Link>{" "}
          y el{" "}
          <Link href="/legal/data_policy" target="_blank" className={linkCls}>
            tratamiento de mis datos personales
          </Link>
        </span>
      </label>
      {state.fieldErrors?.terms ? <Alert>{state.fieldErrors.terms}</Alert> : null}
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingText="Creando cuenta…">Continuar</SubmitButton>
    </form>
  );
}

const RESEND_COOLDOWN_S = 60;

/**
 * "Revisa tu correo": el correo de Supabase trae un ENLACE (no un código). Mientras la pantalla está abierta se vuelve a pedir
 * al servidor el estado de la sesión: si la persona confirma desde otra pestaña del mismo navegador, esta pantalla la lleva sola
 * a la app. El reenvío tiene espera visible (además del límite real en servidor).
 */
export function CheckEmailPanel({ email, mode }: { email: string; mode: "signup" | "recovery" }) {
  const router = useRouter();
  const [resent, resend] = useActionState(resendEmailAction, initialState);
  const [cooldown, setCooldown] = useState(30); // el correo acaba de enviarse
  useEffect(() => {
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (mode !== "signup") return;
    let ticks = 0;
    const refresh = () => router.refresh();
    const poll = setInterval(() => {
      ticks += 1;
      if (ticks > 120) clearInterval(poll); // ~10 min: lo que dura el enlace
      else if (document.visibilityState === "visible") refresh();
    }, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [mode, router]);
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-start gap-4 rounded-2xl bg-[#FFF0DD] p-4">
        <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-brand">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <path d="m4 7 8 6 8-6" />
          </svg>
        </span>
        <p className="m-0 text-[15px] leading-snug font-semibold text-ink-2">
          Abre el correo y haz clic en el enlace. Hazlo desde este mismo navegador para que volvamos aquí automáticamente.
        </p>
      </div>
      <p className="m-0 text-[14px] leading-snug text-muted">¿No encuentras el correo? Revisa <strong>Spam</strong> o <strong>Promociones</strong>. El enlace tiene vigencia limitada.</p>
      <form action={resend} onSubmit={() => setCooldown(RESEND_COOLDOWN_S)} className="flex flex-col gap-2">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="mode" value={mode} />
        {resent.message ? <Alert tone="ok">{resent.message}</Alert> : null}
        {resent.error ? <Alert>{resent.error}</Alert> : null}
        <button
          type="submit"
          disabled={cooldown > 0}
          className="min-h-[58px] rounded-2xl border-[1.5px] border-line-strong bg-white text-[16px] font-extrabold text-ink transition-opacity duration-200 disabled:opacity-60"
        >
          {cooldown > 0 ? `Reenviar correo en ${cooldown} s` : "Reenviar correo"}
        </button>
      </form>
      <div className="flex flex-col gap-1 text-[15px]">
        <Link href="/login" className={`${linkCls} flex min-h-11 items-center`}>
          Ya confirmé mi correo · Iniciar sesión
        </Link>
        <Link href={mode === "recovery" ? "/recuperar" : "/registro"} className={`${linkCls} flex min-h-11 items-center`}>
          Usar otro correo
        </Link>
      </div>
    </div>
  );
}

export function RecoverForm() {
  const [state, action] = useActionState(requestPasswordResetAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <Field
        label="Correo registrado"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingText="Enviando…">Enviar código</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePasswordAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <Field
        label="Contraseña nueva"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.password}
      />
      <Field
        label="Repite la contraseña"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirm}
      />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingText="Guardando…">Guardar y entrar</SubmitButton>
    </form>
  );
}

export function StaffBadge() {
  return (
    <span className="flex items-center gap-2 text-[13px] font-bold tracking-[0.04em] text-muted">
      <IconBadge width={18} height={18} /> ACCESO DEL EQUIPO TECHNOULTRA
    </span>
  );
}
