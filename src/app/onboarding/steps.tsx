"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormDraft } from "@/components/forms/FormDraft";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
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

const selectCls =
  "h-14 rounded-[14px] border-[1.5px] border-line-strong bg-white px-4 text-[17px] font-semibold text-ink";

const PROCESS = [
  ["Registramos tu solicitud", "y te damos un diagnóstico preliminar."],
  ["Recogemos o recibimos tu equipo", "y lo revisamos con evidencia."],
  ["Apruebas la cotización", "no hacemos nada sin tu aprobación."],
  ["Te lo entregamos con garantía", "y próximo mantenimiento programado."],
] as const;

export function WelcomeStep({ name }: { name: string }) {
  const [, action] = useActionState(nextStepAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-5 md:gap-6">
      <p className="m-0 text-base leading-relaxed text-ink-2 md:text-[18px]">
        Hola{name ? `, ${name.split(" ")[0]}` : ""}. En unos pasos dejamos tu cuenta lista: tu celular, tu dirección y tu primer equipo. Así podemos
        atenderte más rápido y mostrarte cada avance de tu servicio.
      </p>
      <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
        {PROCESS.map(([title, rest], i) => (
          <li key={title} className="flex gap-3 rounded-2xl border border-line bg-white p-4">
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-[14px] font-extrabold text-ink">
              {i + 1}
            </span>
            <span className="text-[15px] leading-snug text-ink-2">
              <strong className="font-extrabold text-ink">{title}</strong> {rest}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col md:max-w-[280px]">
        <SubmitButton>Empezar</SubmitButton>
      </div>
    </form>
  );
}

export function PhoneStep() {
  const [state, action] = useActionState(savePhoneAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <FormDraft id="onboarding-celular" />
      <Field
        label="Celular"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="300 123 4567"
        required
        error={state.fieldErrors?.phone}
        hint="Lo usamos para coordinar recogidas y entregas."
      />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <SubmitButton>Continuar</SubmitButton>
    </form>
  );
}

export function AddressStep({ cities }: { cities: { dane_code: string; city_name: string }[] }) {
  const [state, action] = useActionState(saveAddressAction, initialState);
  const [dane, setDane] = useState(cities[0]?.dane_code ?? "other");
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <FormDraft id="onboarding-direccion" />
      <label className="flex flex-col gap-2 text-[15px] font-bold">
        Ciudad
        <select name="dane" value={dane} onChange={(e) => setDane(e.target.value)} className={selectCls}>
          {cities.map((c) => (
            <option key={c.dane_code} value={c.dane_code}>
              {c.city_name}
            </option>
          ))}
          <option value="other">Otra ciudad (solo soporte remoto)</option>
        </select>
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
      <Field
        label="Dirección"
        name="line1"
        autoComplete="street-address"
        required
        error={state.fieldErrors?.line1}
      />
      <Field label="Barrio (opcional)" name="neighborhood" />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <SubmitButton>Continuar</SubmitButton>
    </form>
  );
}

export function EquipmentStep() {
  const [state, action] = useActionState(saveEquipmentAction, initialState);
  const [, skip] = useActionState(skipEquipmentAction, undefined);
  return (
    <div className="flex flex-col gap-[18px]">
      <form action={action} className="flex flex-col gap-[18px]" noValidate>
        <FormDraft id="onboarding-equipo" />
        <label className="flex flex-col gap-2 text-[15px] font-bold">
          Tipo de equipo
          <select name="type" defaultValue="laptop" className={selectCls}>
            <option value="laptop">Portátil</option>
            <option value="desktop">Escritorio</option>
            <option value="all_in_one">Todo en uno</option>
            <option value="printer">Impresora</option>
            <option value="network">Red / router</option>
            <option value="other">Otro</option>
          </select>
        </label>
        <Field label="Marca" name="brand" required error={state.fieldErrors?.brand} />
        <Field label="Modelo" name="model" required error={state.fieldErrors?.model} />
        <Field label="Serial (opcional)" name="serial" hint="Lo encuentras en una etiqueta del equipo." />
        {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
        <SubmitButton>Guardar equipo</SubmitButton>
      </form>
      <form action={skip}>
        <button
          type="submit"
          className="min-h-12 w-full border-none bg-transparent text-[15px] font-bold text-muted"
        >
          Lo hago después
        </button>
      </form>
    </div>
  );
}

type Permission = "granted" | "denied" | "default" | "unsupported" | "error";

/** Pide el permiso al navegador y envía el resultado REAL. Un error o la falta de soporte nunca cuenta como concedido. */
export function NotificationsStep() {
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
    <form action={action} className="flex flex-col gap-[18px]">
      <p className="m-0 text-base leading-relaxed text-ink-2">
        Te avisamos cuando tu equipo cambie de estado o tengas una cotización por aprobar. Siempre verás los
        avisos dentro de la app.
      </p>
      <input type="hidden" name="permission" value={result} />
      {result === "granted" ? <Alert tone="ok">Avisos activados en este dispositivo.</Alert> : null}
      {result === "denied" ? (
        <Alert>Bloqueaste los avisos. Puedes activarlos después desde los ajustes del navegador.</Alert>
      ) : null}
      {result === "unsupported" || result === "error" ? (
        <Alert>Este dispositivo no permite avisos del navegador. Los verás dentro de la app.</Alert>
      ) : null}
      {result === "default" ? (
        <button
          type="button"
          onClick={ask}
          disabled={busy}
          className="min-h-[58px] rounded-2xl border-[1.5px] border-line-strong bg-white text-[17px] font-extrabold disabled:opacity-60"
        >
          {busy ? "Esperando respuesta…" : "Activar avisos"}
        </button>
      ) : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <SubmitButton>{result === "default" ? "Omitir por ahora" : "Continuar"}</SubmitButton>
    </form>
  );
}

export function LegalStep({
  docs,
}: {
  docs: { id: string; slug: string; title: string; version: number }[];
}) {
  const [state, action] = useActionState(finishOnboardingAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-[18px]">
      {docs.length === 0 ? (
        <Alert>
          Los textos legales todavía no están publicados. Administración debe publicarlos antes del
          lanzamiento.
        </Alert>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-[14px] border border-line bg-white px-4 py-3 text-[15px] font-semibold"
            >
              <span>
                {d.title} <span className="text-muted">· v{d.version}</span>
              </span>
              <Link
                href={`/legal/${d.slug}`}
                target="_blank"
                className="font-extrabold underline decoration-brand underline-offset-[3px]"
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
      <SubmitButton pendingText="Finalizando…">Finalizar</SubmitButton>
    </form>
  );
}

export function BackButton() {
  const [, action] = useActionState(nextStepAction, initialState);
  return (
    <form action={action}>
      <input type="hidden" name="dir" value="back" />
      <button type="submit" className="min-h-10 border-none bg-transparent text-[15px] font-bold text-muted">
        ← Atrás
      </button>
    </form>
  );
}
