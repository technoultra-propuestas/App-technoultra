"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { GoogleG, IconBadge } from "@/components/ui/icons";
import { initialState } from "@/lib/auth/schemas";
import {
  requestPasswordResetAction,
  resendCodeAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
  verifyOtpAction,
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
  staff = false,
}: {
  next?: string;
  notice?: string;
  staff?: boolean;
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
        className="w-fit py-1 text-[15px] font-bold underline decoration-brand underline-offset-[3px]"
      >
        ¿Olvidaste tu contraseña?
      </Link>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <SubmitButton variant={staff ? "primary" : "primary"} pendingText="Entrando…">
        Entrar
      </SubmitButton>
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

export function VerifyForm({ email, mode }: { email: string; mode: "signup" | "recovery" }) {
  const [state, action] = useActionState(verifyOtpAction, initialState);
  const [resent, resend] = useActionState(resendCodeAction, initialState);
  return (
    <div className="flex flex-col gap-[18px]">
      <form action={action} className="flex flex-col gap-[18px]" noValidate>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="mode" value={mode} />
        <input
          name="token"
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          aria-label="Código de 6 dígitos"
          placeholder="······"
          required
          className="h-[72px] rounded-2xl border-[1.5px] border-line-strong bg-white px-5 text-center text-[32px] font-extrabold tracking-[0.5em]"
        />
        {state.error ? <Alert>{state.error}</Alert> : null}
        <SubmitButton pendingText="Verificando…">Verificar</SubmitButton>
      </form>
      <form action={resend} className="flex flex-col gap-2">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="mode" value={mode} />
        {resent.message ? <Alert tone="ok">{resent.message}</Alert> : null}
        {resent.error ? <Alert>{resent.error}</Alert> : null}
        <button type="submit" className="min-h-12 border-none bg-transparent text-[15px] font-bold">
          Reenviar código
        </button>
      </form>
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
