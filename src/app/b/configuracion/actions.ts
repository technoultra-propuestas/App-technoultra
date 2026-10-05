"use server";

import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/auth/audit";
import { assertRole } from "@/lib/auth/session";
import type { ActionState } from "@/lib/auth/schemas";
import { parseSetting, SETTINGS } from "@/lib/domain/settings";
import { createClient } from "@/lib/supabase/server";

/** Solo claves de la lista blanca; cada una con su propia validación. RLS + permiso lo vuelven a exigir. */
export async function saveSettingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole(["admin"]);
  const def = SETTINGS.find((s) => s.key === fd.get("key"));
  if (!def) return { ok: false, error: "Ajuste no válido." };
  const parsed = parseSetting(def, String(fd.get("value") ?? ""));
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { error } = await (await createClient()).from("app_settings").upsert({ key: def.key, value: parsed.value, is_public: def.isPublic }, { onConflict: "key" });
  if (error) return { ok: false, error: "No pudimos guardar el ajuste." };
  await auditAdmin(actor.id, "admin.settings_changed", undefined, { setting: def.key });
  revalidatePath("/b/configuracion");
  return { ok: true, message: "Guardado." };
}
