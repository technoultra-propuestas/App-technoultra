"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/form";
import { savePreferencesAction } from "./actions";

/** Preferencias de canal. Las notificaciones dentro de la app siempre están activas; el correo y la notificación del dispositivo se pueden apagar. */
export function PrefsForm({ email }: { email: boolean }) {
  const [state, action] = useActionState(savePreferencesAction, null);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-card border border-line bg-white p-4 shadow-card">
      <h2 className="m-0 text-[16px] font-extrabold">Cómo quieres recibir tus notificaciones</h2>
      <label className="flex min-h-11 items-center gap-3 text-[15px] font-semibold">
        <input type="checkbox" name="email" defaultChecked={email} className="h-5 w-5 accent-[#FF8A00]" />
        Recibir las notificaciones importantes por correo
      </label>
      <p className="m-0 text-[13px] text-muted">Las notificaciones dentro de la app siempre están activas.</p>
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Guardando…" variant="dark">Guardar preferencias</SubmitButton>
        {state ? <span role="status" className={`text-[13px] font-bold ${state.ok ? "text-ok" : "text-danger"}`}>{state.message}</span> : null}
      </div>
    </form>
  );
}
