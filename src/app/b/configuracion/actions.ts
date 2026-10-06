"use server";

import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/auth/audit";
import { assertRole } from "@/lib/auth/session";
import type { ActionState } from "@/lib/auth/schemas";
import { parseSetting, SETTINGS } from "@/lib/domain/settings";
import { createClient } from "@/lib/supabase/server";

const CODES = {
  VALIDATION_ERROR: "El valor no es válido.",
  FORBIDDEN: "No tienes permiso para cambiar este ajuste.",
  DB_ERROR: "No pudimos guardar el ajuste. Inténtalo de nuevo; si continúa, avisa a soporte.",
} as const;
const fail = (code: keyof typeof CODES, error: string = CODES[code]): ActionState => ({ ok: false, error: `${error} (${code})` });

/**
 * Guarda un ajuste del negocio. Solo SUPERADMIN con MFA (assertRole) y solo claves de la lista blanca, cada una con su validación;
 * RLS lo vuelve a exigir en la base de datos.
 *
 * Importante: NO se usa `.upsert()`. supabase-js lo traduce a `ON CONFLICT (key) DO UPDATE SET key = excluded.key, …`, y esa
 * sentencia necesita permiso de UPDATE sobre la columna `key`, que (a propósito) nadie tiene: la clave de un ajuste es inmutable.
 * Por eso se actualiza `value`/`is_public` y, si el ajuste aún no existe, se inserta.
 */
export async function saveSettingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole(["superadmin"]);
  const def = SETTINGS.find((s) => s.key === fd.get("key"));
  if (!def) return fail("VALIDATION_ERROR", "Ajuste no válido.");
  const parsed = parseSetting(def, String(fd.get("value") ?? ""));
  if (!parsed.ok) return fail("VALIDATION_ERROR", parsed.error);

  const supabase = await createClient();
  const row = { value: parsed.value, is_public: def.isPublic };
  const first = await supabase.from("app_settings").update(row).eq("key", def.key).select("key");
  let error = first.error;
  if (!error && !first.data?.length) {
    ({ error } = await supabase.from("app_settings").insert({ key: def.key, ...row }));
    // carrera con otra pestaña que creó el ajuste justo antes: se actualiza
    if (error?.code === "23505") ({ error } = await supabase.from("app_settings").update(row).eq("key", def.key));
  }
  if (error) {
    // Causa real solo en el log del servidor (sin valores del ajuste): código SQLSTATE y mensaje de PostgREST.
    console.error("settings.save", { key: def.key, code: error.code, message: error.message });
    return fail(error.code === "42501" ? "FORBIDDEN" : "DB_ERROR");
  }
  await auditAdmin(actor.id, "superadmin.settings_changed", undefined, { setting: def.key });
  revalidatePath("/b/configuracion");
  return { ok: true, message: "Guardado." };
}
