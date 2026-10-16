"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { allow, TOO_MANY } from "@/lib/auth/rate-limit";
import type { ActionState } from "@/lib/auth/schemas";
import { destroyAssets } from "@/lib/cloudinary";
import { BUCKET } from "@/lib/documents/generate";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ userId: z.string().uuid(), confirmEmail: z.string().trim().toLowerCase().email().max(254) });

/**
 * Elimina DEFINITIVAMENTE una cuenta y todo lo suyo. Solo SUPERADMIN con MFA (aal2): la identidad sale de la sesión validada en servidor,
 * la función de base de datos vuelve a verificar que el actor sea superadmin activo, que el objetivo no sea un superadmin ni él mismo y
 * que el correo escrito coincida. Deja una copia completa en `purged_users_archive` (solo service_role) y auditoría. Después borra, con
 * mejor esfuerzo, los archivos asociados (PDF firmados en Storage y fotos en Cloudinary).
 */
export async function purgeUserAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole(["superadmin"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: "Escribe el correo exacto de la cuenta para confirmar." };
  if (!(await allow("purge-user", actor.id, 10, 3600))) return { ok: false, error: TOO_MANY };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_purge_user", { p_actor: actor.id, p_target: parsed.data.userId, p_confirm_email: parsed.data.confirmEmail });
  if (error) {
    const m = error.message;
    console.error("user.purge", error.code);
    return {
      ok: false,
      error: m.includes("email_mismatch")
        ? "El correo no coincide. Escríbelo exactamente como aparece."
        : m.includes("cannot_purge_superadmin")
          ? "No se puede eliminar a un superadministrador."
          : m.includes("cannot_purge_self")
            ? "No puedes eliminar tu propia cuenta."
            : m.includes("purge_blocked")
              ? "Esta cuenta tiene registros que firmó o autorizó sobre datos de otras personas; no se puede eliminar sin perder esa trazabilidad."
              : "No pudimos eliminar la cuenta. No se borró nada.",
    };
  }
  const assets = ((data as { assets?: { documents?: string[]; cloudinary?: string[] } } | null)?.assets) ?? {};
  if (assets.documents?.length) await admin.storage.from(BUCKET).remove(assets.documents).catch(() => undefined);
  await destroyAssets(assets.cloudinary ?? []);
  revalidatePath("/b/usuarios");
  revalidatePath("/b/clientes");
  return { ok: true, message: "Cuenta eliminada. Quedó una copia cifrada en el archivo interno y el registro de auditoría." };
}
