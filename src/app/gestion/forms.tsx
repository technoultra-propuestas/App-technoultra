"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { initialState } from "@/lib/auth/schemas";
import {
  staffRequestRecoveryAction,
  staffResetPasswordAction,
  staffSignInAction,
  startEnrollmentAction,
  verifyChallengeAction,
  verifyEnrollmentAction,
  type EnrollState,
} from "./actions";

const linkCls = "font-bold text-ink underline decoration-brand underline-offset-[3px]";
const codeCls = "h-[64px] rounded-2xl border-[1.5px] border-line-strong bg-white px-5 text-center text-[28px] font-extrabold tracking-[0.4em]";

export function StaffLoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState(staffSignInAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {notice ? <Alert>{notice}</Alert> : null}
      <Field label="Correo electrónico" name="email" type="email" inputMode="email" autoComplete="username" required error={state.fieldErrors?.email} />
      <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required error={state.fieldErrors?.password} />
      <Link href="/gestion/recuperar" className={`${linkCls} flex min-h-11 w-fit items-center text-[15px]`}>
        ¿Olvidaste tu contraseña?
      </Link>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingText="Ingresando…">Ingresar</SubmitButton>
    </form>
  );
}

/** Primer ingreso: el QR y el secreto existen solo en esta respuesta; no se guardan en ninguna tabla de TechnoUltra. */
export function EnrollPanel({ next }: { next?: string }) {
  const [started, start] = useActionState<EnrollState, FormData>(startEnrollmentAction, initialState);
  const [verified, verify] = useActionState<EnrollState, FormData>(verifyEnrollmentAction, initialState);
  const [showSecret, setShowSecret] = useState(false);
  const enroll = started.enroll;
  if (!enroll) {
    return (
      <div className="flex flex-col gap-4">
        <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-snug text-ink-2">
          <li>Instala una app autenticadora (Google Authenticator, Microsoft Authenticator, Authy o 1Password).</li>
          <li>Escanea el código QR que te mostraremos.</li>
          <li>Escribe el código de 6 dígitos que genera la app.</li>
        </ol>
        <form action={start} className="flex flex-col gap-3">
          {started.error ? <Alert>{started.error}</Alert> : null}
          <SubmitButton pendingText="Preparando…">Configurar autenticador</SubmitButton>
        </form>
      </div>
    );
  }
  const spaced = enroll.secret.replace(/(.{4})/g, "$1 ").trim();
  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto w-full max-w-[240px] rounded-2xl border border-line bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- QR en data URI generado por Supabase Auth */}
        <img src={enroll.qr} alt="Código QR para configurar tu aplicación autenticadora" width={216} height={216} className="h-auto w-full" />
      </div>
      <a href={enroll.uri} className={`${linkCls} flex min-h-11 items-center justify-center text-[14px]`}>
        Abrir en la app de este dispositivo
      </a>
      <button type="button" onClick={() => setShowSecret((s) => !s)} className="min-h-11 rounded-xl border border-line-strong bg-white text-[14px] font-bold">
        {showSecret ? "Ocultar clave manual" : "¿No puedes escanear? Mostrar clave manual"}
      </button>
      {showSecret ? <p className="m-0 rounded-xl bg-[#F6F6F5] p-3 text-center font-mono text-[15px] font-bold break-all select-all">{spaced}</p> : null}
      <form action={verify} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="factorId" value={enroll.factorId} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <input name="code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" aria-label="Código de 6 dígitos" placeholder="······" required className={codeCls} />
        {verified.error ? <Alert>{verified.error}</Alert> : null}
        <SubmitButton pendingText="Verificando…">Activar verificación</SubmitButton>
      </form>
    </div>
  );
}

export function ChallengeForm({ next }: { next?: string }) {
  const [state, action] = useActionState(verifyChallengeAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="flex flex-col gap-2 text-[15px] font-bold">
        Código de tu aplicación autenticadora
        <input name="code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="······" required autoFocus className={codeCls} />
      </label>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingText="Verificando…">Verificar</SubmitButton>
    </form>
  );
}

export function StaffRecoveryForm() {
  const [state, action] = useActionState(staffRequestRecoveryAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <Field label="Correo electrónico" name="email" type="email" inputMode="email" autoComplete="username" required error={state.fieldErrors?.email} />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingText="Enviando…">Enviar enlace</SubmitButton>
    </form>
  );
}

export function StaffResetPasswordForm() {
  const [state, action] = useActionState(staffResetPasswordAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <Field label="Nueva contraseña" name="password" type="password" autoComplete="new-password" required hint="Mínimo 10 caracteres, con mayúscula, minúscula y número." error={state.fieldErrors?.password} />
      <Field label="Repite la contraseña" name="confirm" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirm} />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingText="Guardando…">Guardar contraseña</SubmitButton>
    </form>
  );
}
