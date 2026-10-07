"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { haptic } from "@/lib/haptics";
import type { InputHTMLAttributes, ReactNode } from "react";

/** Campo de formulario con el estilo aprobado (alto 56, borde 1.5, radio 14). */
export function Field({
  label,
  name,
  hint,
  error,
  ...rest
}: { label: string; name: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${name}`;
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-2 text-[15px] font-bold">
      {label}
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className="h-14 w-full min-w-0 rounded-ctl border-[1.5px] border-line-strong bg-white px-4 text-[17px] font-semibold text-ink placeholder:text-muted/60"
        {...rest}
      />
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

export function SubmitButton({
  children,
  variant = "primary",
  pendingText = "Un momento…",
}: {
  children: ReactNode;
  variant?: "primary" | "dark";
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  const styles = variant === "primary" ? "bg-brand text-ink" : "bg-ink text-white";
  return (
    <button
      type="submit"
      disabled={pending}
      className={`press min-h-[58px] rounded-2xl border-none text-[17px] font-extrabold disabled:opacity-60 ${styles}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "ok" }) {
  const styles = tone === "error" ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok";
  // Confirmación o aviso háptico sutil cuando aparece el resultado de una acción.
  useEffect(() => {
    haptic(tone === "ok" ? "success" : "error");
  }, [tone]);
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-[14px] px-3.5 py-3 text-[15px] font-bold ${styles}`}
    >
      {children}
    </div>
  );
}
