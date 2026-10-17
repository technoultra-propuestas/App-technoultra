"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { FormDraft } from "@/components/forms/FormDraft";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { GoogleG, IconBadge } from "@/components/ui/icons";
import { initialState } from "@/lib/auth/schemas";
import {
  requestPasswordResetAction,
  resendEmailAction,
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

const fico = { "aria-hidden": true, viewBox: "0 0 24 24", width: 22, height: 22, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconUser = () => (
  <svg {...fico}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5" />
  </svg>
);
const IconMail = () => (
  <svg {...fico}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m4 7.5 8 5.5 8-5.5" />
  </svg>
);
const IconLock = () => (
  <svg {...fico}>
    <rect x="5" y="11" width="14" height="9" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

/**
 * Campo del registro. En móvil/tableta es idéntico a `Field` (mismas clases); en escritorio (≥1024 px) añade ícono a la izquierda, el ejemplo
 * bajo el campo y, en la contraseña, el ojito para verla. Mismos nombres, tipos y validación: solo cambia la presentación.
 */
function RegField({
  label,
  name,
  hint,
  example,
  error,
  icon,
  reveal,
  ...rest
}: { label: string; name: string; hint?: string; example?: string; error?: string; icon: ReactNode; reveal?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${name}`;
  const [show, setShow] = useState(false);
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-2 text-[15px] font-bold">
      {label}
      <span className="relative block">
        <input
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className="h-14 w-full min-w-0 rounded-ctl border-[1.5px] border-line-strong bg-white px-4 text-[17px] font-semibold text-ink placeholder:text-muted/60 pl-12 lg:text-[16px] [@media(max-height:940px)]:lg:h-12"
          {...rest}
          type={reveal && show ? "text" : rest.type}
        />
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
          {icon}
        </span>
        {reveal ? (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={show}
            className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl border-none bg-transparent text-muted hover:text-ink"
          >
            <svg {...fico}>
              <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
              <circle cx="12" cy="12" r="2.8" />
              {show ? <path d="M4 4l16 16" /> : null}
            </svg>
          </button>
        ) : null}
      </span>
      {example && !error ? <span className="block text-[12.5px] font-semibold text-muted [@media(max-height:940px)]:lg:hidden">{example}</span> : null}
      {hint && !error ? (
        <span id={`${id}-hint`} className="text-[13px] font-semibold text-muted">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-err`} className="text-[13px] font-bold text-[#9A2B1E]">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(signUpAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-[18px] lg:gap-4 [@media(max-height:940px)]:lg:gap-3" noValidate>
      <FormDraft id="registro" />
      <RegField
        label="Nombre completo"
        name="fullName"
        autoComplete="name"
        required
        icon={<IconUser />}
        example="Ej. Juan Pérez"
        error={state.fieldErrors?.fullName}
      />
      <RegField
        label="Correo"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        icon={<IconMail />}
        example="Ej. juan@correo.com"
        error={state.fieldErrors?.email}
      />
      <RegField
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        reveal
        icon={<IconLock />}
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 rounded-2xl bg-[#FFF3E4] p-4">
        <span aria-hidden className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[16px] bg-brand shadow-[0_8px_18px_-10px_rgba(255,138,0,.9)]">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <path d="m4 7 8 6 8-6" />
          </svg>
        </span>
        <p className="m-0 text-[14.5px] leading-snug text-ink-2">
          <strong className="font-extrabold text-ink">Abre el correo y haz clic en el enlace.</strong>
          <br />
          Hazlo desde este mismo navegador para que volvamos aquí automáticamente.
        </p>
      </div>
      <p className="m-0 flex items-start gap-3 text-[13.5px] leading-snug text-muted">
        <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        <span>
          ¿No encuentras el correo? Revisa <strong className="text-ink-2">Spam</strong> o <strong className="text-ink-2">Promociones</strong>. El enlace tiene vigencia limitada.
        </span>
      </p>
      <form action={resend} onSubmit={() => setCooldown(RESEND_COOLDOWN_S)} className="flex flex-col gap-2">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="mode" value={mode} />
        {resent.message ? <Alert tone="ok">{resent.message}</Alert> : null}
        {resent.error ? <Alert>{resent.error}</Alert> : null}
        <button
          type="submit"
          disabled={cooldown > 0}
          className="flex min-h-[56px] items-center justify-center gap-3 rounded-2xl border border-line bg-[#F4F4F2] text-[15.5px] font-bold text-ink-2 transition-colors duration-200 enabled:bg-white enabled:text-ink enabled:hover:border-brand"
        >
          {cooldown > 0 ? (
            <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#FF8A00" strokeWidth="2.6" strokeLinecap="round" className="motion-safe:animate-spin">
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          ) : null}
          {cooldown > 0 ? `Reenviar correo en ${cooldown} s` : "Reenviar correo"}
        </button>
      </form>
      <div aria-hidden className="flex items-center gap-3 text-[13px] font-semibold text-muted">
        <span className="h-px flex-1 bg-line-strong" /> o <span className="h-px flex-1 bg-line-strong" />
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-[14.5px] sm:grid-cols-2">
        <Link href="/login" className="flex min-h-12 items-center justify-between gap-2 font-extrabold text-ink no-underline">
          <span className="flex items-center gap-2.5">
            <svg aria-hidden viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#FF8A00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <rect x="4" y="4" width="16" height="16" rx="4" />
              <path d="m8.5 12.5 2.5 2.5 4.5-5" />
            </svg>
            Ya confirmé mi correo
          </span>
          <span aria-hidden className="text-brand">→</span>
        </Link>
        <Link href={mode === "recovery" ? "/recuperar" : "/registro"} className="flex min-h-12 items-center justify-between gap-2 font-extrabold text-ink no-underline">
          <span className="flex items-center gap-2.5">
            <svg aria-hidden viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#FF8A00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <path d="m4 7 8 6 8-6" />
            </svg>
            Usar otro correo
          </span>
          <span aria-hidden className="text-brand">→</span>
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
      <SubmitButton pendingText="Enviando…">Enviar enlace</SubmitButton>
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
