"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/form";
import { initialState } from "@/lib/auth/schemas";
import { signInAction } from "../actions";

/** Solo se recuerda el CORREO en este dispositivo (nunca la contraseña) y únicamente si la persona marca «Recordarme». */
const REMEMBER_KEY = "tu:login-email";

const ico = { "aria-hidden": true, viewBox: "0 0 24 24", width: 22, height: 22, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconMail = () => (
  <svg {...ico}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m4 7.5 8 5.5 8-5.5" />
  </svg>
);
const IconLock = () => (
  <svg {...ico}>
    <rect x="5" y="11" width="14" height="9" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
const IconEye = ({ off }: { off: boolean }) => (
  <svg {...ico}>
    <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.8" />
    {off ? <path d="M4 4l16 16" /> : null}
  </svg>
);

function IconField({ icon, error, children, end }: { icon: ReactNode; error?: string; children: ReactNode; end?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`flex h-14 items-center gap-3 rounded-ctl border-[1.5px] bg-white px-3.5 text-muted transition-colors focus-within:border-brand focus-within:text-ink ${
          error ? "border-danger" : "border-line-strong"
        }`}
      >
        <span className="flex-none">{icon}</span>
        {children}
        {end}
      </div>
      {error ? <span className="text-[13px] font-bold text-danger">{error}</span> : null}
    </div>
  );
}

const inputCls =
  "h-full min-w-0 flex-1 border-none bg-transparent p-0 text-[16px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-muted/70 focus-visible:outline-none";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="press flex min-h-[56px] items-center justify-center gap-2 rounded-ctl border-none bg-brand text-[17px] font-extrabold text-ink shadow-[0_8px_20px_-8px_rgba(255,138,0,.7)] disabled:opacity-60"
    >
      {pending ? "Entrando…" : "Iniciar sesión"}
      {pending ? null : (
        <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      )}
    </button>
  );
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState(signInAction, initialState);
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);

  useEffect(() => {
    // Diferido un tick: leer el almacenamiento solo en el cliente y fuera del render evita diferencias de hidratación.
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem(REMEMBER_KEY);
        if (saved) {
          setEmail(saved);
          setRemember(true);
        }
      } catch {
        /* almacenamiento bloqueado: el formulario funciona igual */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const persist = () => {
    try {
      if (remember && email.trim()) localStorage.setItem(REMEMBER_KEY, email.trim().toLowerCase());
      else localStorage.removeItem(REMEMBER_KEY);
    } catch {
      /* ignorar */
    }
  };

  return (
    <form action={action} onSubmit={persist} className="flex flex-col gap-4" noValidate autoComplete="on">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {notice ? <Alert>{notice}</Alert> : null}
      <IconField icon={<IconMail />} error={state.fieldErrors?.email}>
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={254}
          required
          placeholder="Correo electrónico"
          aria-label="Correo electrónico"
          aria-invalid={state.fieldErrors?.email ? true : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
        />
      </IconField>
      <IconField
        icon={<IconLock />}
        error={state.fieldErrors?.password}
        end={
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={show}
            className="-mr-1.5 flex h-11 w-11 flex-none items-center justify-center rounded-xl text-muted hover:text-ink"
          >
            <IconEye off={show} />
          </button>
        }
      >
        <input
          name="password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={72}
          required
          placeholder="Contraseña"
          aria-label="Contraseña"
          aria-invalid={state.fieldErrors?.password ? true : undefined}
          onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
          onBlur={() => setCaps(false)}
          className={inputCls}
        />
      </IconField>
      {caps ? <p className="m-0 -mt-2 text-[13px] font-bold text-warn">Tienes el bloqueo de mayúsculas activado.</p> : null}
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <Submit />
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[14px] font-semibold text-ink-2">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-5 w-5 accent-[#FF8A00]" />
          Recordarme
        </label>
        <Link href="/recuperar" className="flex min-h-11 items-center text-[14px] font-bold text-brand-text underline decoration-brand underline-offset-[3px]">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
    </form>
  );
}
