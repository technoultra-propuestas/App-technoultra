"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { FormDraft } from "@/components/forms/FormDraft";
import { Alert, Field } from "@/components/ui/form";
import { initialState } from "@/lib/auth/schemas";
import {
  finishOnboardingAction,
  nextStepAction,
  saveAddressAction,
  saveEquipmentAction,
  saveNotificationPermissionAction,
  savePhoneAction,
  skipEquipmentAction,
} from "./actions";

/* Solo presentación: la lógica (acciones del servidor, pasos, validación) no cambia. */

const inputCls =
  "h-14 w-full min-w-0 rounded-[14px] border-[1.5px] border-line-strong bg-white px-4 text-[17px] font-semibold text-ink placeholder:text-muted/60";

const arrow = (
  <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

function Primary({ children, pendingText = "Un momento…", full = false }: { children: ReactNode; pendingText?: string; full?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`press flex min-h-[54px] items-center justify-center gap-2 rounded-[14px] border-none bg-brand px-7 text-[17px] font-extrabold text-ink shadow-[0_8px_20px_-10px_rgba(255,138,0,.8)] disabled:opacity-60 ${full ? "w-full" : "min-w-[160px]"}`}
    >
      {pending ? pendingText : children}
      {pending ? null : arrow}
    </button>
  );
}

/** «← Atrás»: botón de OTRO formulario (el de `BackButton`, vía el atributo `form`) para no enviar ni borrar lo escrito en este. */
function BackAction() {
  return (
    <button type="submit" form="onboarding-back" className="flex min-h-12 items-center gap-1.5 border-none bg-transparent px-1 text-[16px] font-bold text-ink-2">
      <span aria-hidden>←</span> Atrás
    </button>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-auto flex items-center justify-between gap-3 pt-1">
      <BackAction />
      {children}
    </div>
  );
}

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

const Flag = () => (
  <span aria-hidden className="flex h-[18px] w-6 shrink-0 flex-col overflow-hidden rounded-[3px] ring-1 ring-black/10">
    <span className="h-1/2 bg-[#FCD116]" />
    <span className="h-1/4 bg-[#003893]" />
    <span className="h-1/4 bg-[#CE1126]" />
  </span>
);

export function WelcomeStep({ name, art }: { name: string; art?: ReactNode }) {
  const [, action] = useActionState(nextStepAction, initialState);
  return (
    <form action={action} className="flex flex-1 flex-col gap-5 md:gap-6">
      <p className="m-0 text-base leading-relaxed text-ink-2 md:text-[18px]">
        Hola{name ? `, ${name.split(" ")[0]}` : ""}. En unos pasos dejamos tu cuenta lista: tu celular, tu dirección y tu primer equipo. Así podemos
        atenderte más rápido y mostrarte cada avance de tu servicio.
      </p>
      <div className="my-auto lg:hidden">{art}</div>
      <div className="flex flex-col md:max-w-[320px]">
        <Primary full>Empezar</Primary>
      </div>
    </form>
  );
}

export function PhoneStep({ art }: { art?: ReactNode }) {
  const [state, action] = useActionState(savePhoneAction, initialState);
  return (
    <form action={action} className="flex flex-1 flex-col gap-[18px]" noValidate>
      <FormDraft id="onboarding-celular" />
      <div className="flex flex-col gap-2 text-[15px] font-bold">
        <label htmlFor="f-phone">Celular</label>
        <div className="flex gap-2.5">
          <span className="flex h-14 shrink-0 items-center gap-2 rounded-[14px] border-[1.5px] border-line-strong bg-white px-3.5 text-[17px] font-semibold text-ink">
            <Flag /> +57
          </span>
          <input
            id="f-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="300 123 4567"
            required
            aria-invalid={state.fieldErrors?.phone ? true : undefined}
            aria-describedby="f-phone-hint"
            className={inputCls}
          />
        </div>
        {state.fieldErrors?.phone ? (
          <span className="text-[13px] font-bold text-[#9A2B1E]">{state.fieldErrors.phone}</span>
        ) : (
          <span id="f-phone-hint" className="text-[13px] font-semibold text-muted">
            Lo usamos para coordinar recogidas y entregas.
          </span>
        )}
      </div>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <div className="my-auto lg:hidden">{art}</div>
      <Actions>
        <Primary>Continuar</Primary>
      </Actions>
    </form>
  );
}

export function AddressStep({ cities, art }: { cities: { dane_code: string; city_name: string }[]; art?: ReactNode }) {
  const [state, action] = useActionState(saveAddressAction, initialState);
  const [dane, setDane] = useState(cities[0]?.dane_code ?? "other");
  return (
    <form action={action} className="flex flex-1 flex-col gap-[18px]" noValidate>
      <FormDraft id="onboarding-direccion" />
      <label className="flex flex-col gap-2 text-[15px] font-bold">
        Ciudad
        <span className="relative block">
          <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink">
            <path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          <select name="dane" value={dane} onChange={(e) => setDane(e.target.value)} className={`${inputCls} appearance-none pl-12 pr-11`}>
            {cities.map((c) => (
              <option key={c.dane_code} value={c.dane_code}>
                {c.city_name}
              </option>
            ))}
            <option value="other">Otra ciudad (solo soporte remoto)</option>
          </select>
          <Chevron />
        </span>
      </label>
      {dane === "other" ? (
        <>
          <Field label="Ciudad" name="otherCity" required />
          <Field label="Departamento" name="otherDept" required />
          <Alert tone="ok">
            Por ahora el servicio presencial solo está en Cali, Palmira, Jamundí y Yumbo. Puedes usar la
            asistencia remota en toda Colombia.
          </Alert>
        </>
      ) : null}
      <div className="grid gap-[18px] lg:grid-cols-2 lg:gap-4">
        <Field
          label="Dirección"
          name="line1"
          autoComplete="street-address"
          placeholder="Ej. Calle 5 # 12 - 34"
          required
          error={state.fieldErrors?.line1}
        />
        <Field label="Barrio (opcional)" name="neighborhood" placeholder="Ej. San Fernando" />
      </div>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <div className="my-auto lg:hidden">{art}</div>
      <Actions>
        <Primary>Continuar</Primary>
      </Actions>
    </form>
  );
}

export function EquipmentStep({ art }: { art?: ReactNode }) {
  const [state, action] = useActionState(saveEquipmentAction, initialState);
  return (
    <form action={action} className="flex flex-1 flex-col gap-[18px]" noValidate>
      <FormDraft id="onboarding-equipo" />
      <label className="flex flex-col gap-2 text-[15px] font-bold">
        Tipo de equipo
        <span className="relative block">
          <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink">
            <rect x="4" y="5" width="16" height="11" rx="2" />
            <path d="M2 19h20" />
          </svg>
          <select name="type" defaultValue="laptop" className={`${inputCls} appearance-none pl-12 pr-11`}>
            <option value="laptop">Portátil</option>
            <option value="desktop">Escritorio</option>
            <option value="all_in_one">Todo en uno</option>
            <option value="printer">Impresora</option>
            <option value="network">Red / router</option>
            <option value="other">Otro</option>
          </select>
          <Chevron />
        </span>
      </label>
      <div className="grid gap-[18px] lg:grid-cols-2 lg:gap-4">
        <Field label="Marca" name="brand" placeholder="Ej. HP, Dell, Lenovo" required error={state.fieldErrors?.brand} />
        <Field label="Modelo" name="model" placeholder="Ej. Pavilion 15" required error={state.fieldErrors?.model} />
      </div>
      <Field label="Serial (opcional)" name="serial" placeholder="Ej. ABC123456" hint="Lo encuentras en una etiqueta del equipo." />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <div className="my-auto lg:hidden">{art}</div>
      <Actions>
        <Primary>Continuar</Primary>
      </Actions>
    </form>
  );
}

/** «Omitir» del paso del equipo (usa la misma acción de servidor que antes: «Lo hago después»). */
export function SkipEquipment() {
  const [, skip] = useActionState(skipEquipmentAction, undefined);
  return (
    <form action={skip}>
      <button type="submit" className="min-h-10 border-none bg-transparent px-1 text-[13px] font-bold text-muted underline decoration-line-strong underline-offset-[3px]">
        Omitir
      </button>
    </form>
  );
}

type Permission = "granted" | "denied" | "default" | "unsupported" | "error";

/** Pide el permiso al navegador y envía el resultado REAL. Un error o la falta de soporte nunca cuenta como concedido. */
export function NotificationsStep({ art }: { art?: ReactNode }) {
  const [state, action] = useActionState(saveNotificationPermissionAction, initialState);
  const [result, setResult] = useState<Permission>("default");
  const [busy, setBusy] = useState(false);

  async function ask() {
    setBusy(true);
    let r: Permission;
    try {
      r =
        typeof Notification === "undefined"
          ? "unsupported"
          : ((await Notification.requestPermission()) as Permission);
    } catch {
      r = "error";
    }
    setResult(r);
    setBusy(false);
  }

  return (
    <form action={action} className="flex flex-1 flex-col gap-[18px]">
      <p className="m-0 text-base leading-relaxed text-ink-2">
        Te avisamos cuando tu equipo cambie de estado o tengas una cotización por aprobar. Siempre verás los
        notificaciones dentro de la app.
      </p>
      <input type="hidden" name="permission" value={result} />
      {result === "granted" ? <Alert tone="ok">Notificaciones activadas en este dispositivo.</Alert> : null}
      {result === "denied" ? (
        <Alert>Bloqueaste las notificaciones. Puedes activarlas después desde los ajustes del navegador.</Alert>
      ) : null}
      {result === "unsupported" || result === "error" ? (
        <Alert>Este dispositivo no permite notificaciones del navegador. Las verás dentro de la app.</Alert>
      ) : null}
      <div className="my-auto lg:hidden">{art}</div>
      {result === "default" ? (
        <button
          type="button"
          onClick={ask}
          disabled={busy}
          className="press min-h-[56px] rounded-[14px] border-none bg-brand text-[17px] font-extrabold text-ink shadow-[0_8px_20px_-10px_rgba(255,138,0,.8)] disabled:opacity-60"
        >
          {busy ? "Esperando respuesta…" : "Activar notificaciones"}
        </button>
      ) : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      {result === "default" ? (
        <OutlineSubmit>Omitir por ahora</OutlineSubmit>
      ) : null}
      <Actions>{result === "default" ? <span /> : <Primary>Continuar</Primary>}</Actions>
    </form>
  );
}

function OutlineSubmit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="press min-h-[56px] rounded-[14px] border-[1.5px] border-line-strong bg-white text-[17px] font-extrabold text-ink disabled:opacity-60">
      {pending ? "Un momento…" : children}
    </button>
  );
}

const DocIcon = () => (
  <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF0DD] text-brand">
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5M10 13h6M10 17h6" />
    </svg>
  </span>
);

export function LegalStep({
  docs,
  art,
}: {
  docs: { id: string; slug: string; title: string; version: number }[];
  art?: ReactNode;
}) {
  const [state, action] = useActionState(finishOnboardingAction, initialState);
  return (
    <form action={action} className="flex flex-1 flex-col gap-[18px]">
      {docs.length === 0 ? (
        <Alert>
          Los textos legales todavía no están publicados. Administración debe publicarlos antes del
          lanzamiento.
        </Alert>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 rounded-2xl border border-line bg-white px-3.5 py-3 text-[15px] font-semibold shadow-[0_6px_18px_-14px_rgba(0,0,0,.35)]"
            >
              <DocIcon />
              <span className="min-w-0 flex-1 leading-snug">
                {d.title} <span className="text-muted">· v{d.version}</span>
              </span>
              <Link
                href={`/legal/${d.slug}`}
                target="_blank"
                className="flex min-h-11 items-center font-extrabold text-brand-text underline decoration-brand underline-offset-[3px]"
              >
                Leer
              </Link>
            </li>
          ))}
        </ul>
      )}
      <label className="flex items-start gap-3 py-1.5 text-[15px] font-semibold leading-[1.4]">
        <input type="checkbox" name="accept" className="mt-0.5 h-6 w-6 flex-none accent-[#FF8A00]" required />
        <span>Leí y acepto los documentos anteriores y el tratamiento de mis datos personales.</span>
      </label>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div className="my-auto lg:hidden">{art}</div>
      <Actions>
        <Primary pendingText="Finalizando…">Finalizar</Primary>
      </Actions>
    </form>
  );
}

/** Formulario de «Atrás» (sin botón visible): lo envía `BackAction` desde cada paso con el atributo `form`. La acción valida en servidor. */
export function BackButton() {
  const [, action] = useActionState(nextStepAction, initialState);
  return (
    <form id="onboarding-back" action={action} className="hidden">
      <input type="hidden" name="dir" value="back" />
    </form>
  );
}
