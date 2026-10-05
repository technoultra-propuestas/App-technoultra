"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui/form";
import { initialState } from "@/lib/auth/schemas";
import { saveSettingAction } from "./actions";

export function SettingForm({ settingKey, label, hint, value, numeric }: { settingKey: string; label: string; hint?: string; value: string; numeric: boolean }) {
  const [state, action] = useActionState(saveSettingAction, initialState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <input type="hidden" name="key" value={settingKey} />
      <div className="min-w-[220px] flex-1">
        <Field label={label} name="value" defaultValue={value} inputMode={numeric ? "numeric" : undefined} hint={hint} />
      </div>
      <div className="w-32">
        <SubmitButton pendingText="…">Guardar</SubmitButton>
      </div>
      {state.error ? <div className="w-full"><Alert>{state.error}</Alert></div> : null}
      {state.ok && state.message ? <div className="w-full"><Alert tone="ok">{state.message}</Alert></div> : null}
    </form>
  );
}
