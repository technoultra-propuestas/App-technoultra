"use client";

import { useFormStatus } from "react-dom";
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
    <label htmlFor={id} className="flex flex-col gap-2 text-[15px] font-bold">
      {label}
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className="h-14 rounded-[14px] border-[1.5px] border-line-strong bg-white px-4 text-[17px] font-semibold text-ink placeholder:text-muted/60"
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
      className={`min-h-[58px] rounded-2xl border-none text-[17px] font-extrabold transition-opacity duration-200 disabled:opacity-60 ${styles}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "ok" }) {
  const styles = tone === "error" ? "bg-[#F7E4E1] text-[#9A2B1E]" : "bg-[#E3F3E8] text-[#1F6B3A]";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-[14px] px-3.5 py-3 text-[15px] font-bold ${styles}`}
    >
      {children}
    </div>
  );
}
