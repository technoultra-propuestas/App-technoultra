"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/form";
import { initialState } from "@/lib/auth/schemas";
import { purgeUserAction } from "./purge-actions";

/** «Eliminar» (solo se muestra a SUPERADMIN; la acción de servidor vuelve a validarlo). Pide escribir el correo exacto. */
export function PurgeUserButton({ userId, email, name }: { userId: string; email: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(purgeUserAction, initialState);
  return (
    <div className={`flex flex-col items-end gap-2 ${open ? "w-full" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="min-h-11 rounded-[14px] border border-[#E7B9B2] bg-white px-4 text-[14px] font-extrabold text-danger"
      >
        Eliminar
      </button>
      {open ? (
        <form action={action} className="flex w-full flex-col gap-3 rounded-2xl border border-[#E7B9B2] bg-danger-soft p-4" noValidate>
          <input type="hidden" name="userId" value={userId} />
          <p className="m-0 text-[14px] leading-snug text-ink-2">
            Vas a eliminar <strong>{name}</strong> y <strong>todo lo suyo</strong> (equipos, direcciones, tickets, pagos, documentos y notificaciones). No se puede deshacer
            desde la app; queda una copia cifrada en el archivo interno. Para confirmar, escribe el correo <strong>{email}</strong>.
          </p>
          <input
            name="confirmEmail"
            type="email"
            autoComplete="off"
            spellCheck={false}
            placeholder={email}
            aria-label={`Escribe ${email} para confirmar`}
            required
            className="h-12 rounded-[14px] border-[1.5px] border-line-strong bg-white px-4 text-[16px] font-semibold"
          />
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.message ? <Alert tone="ok">{state.message}</Alert> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-[14px] border border-line-strong bg-white px-4 text-[14px] font-extrabold">
              Cancelar
            </button>
            <button type="submit" disabled={pending} className="min-h-11 rounded-[14px] border-none bg-danger px-4 text-[14px] font-extrabold text-white disabled:opacity-60">
              {pending ? "Eliminando…" : "Eliminar definitivamente"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
