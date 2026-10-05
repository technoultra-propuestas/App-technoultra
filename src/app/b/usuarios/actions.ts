"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { allow, TOO_MANY } from "@/lib/auth/rate-limit";
import { phoneCO, zodToState, type ActionState } from "@/lib/auth/schemas";
import { getPublicEnv } from "@/lib/env.public";
import { createAdminClient } from "@/lib/supabase/admin";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un correo válido.").max(254),
  fullName: z.string().trim().min(3, "Escribe el nombre completo.").max(120),
  role: z.enum(["technician", "admin"], { message: "Elige un rol." }),
  phone: z.union([z.literal(""), phoneCO]).optional(),
  title: z.string().trim().max(80).optional(),
});

/**
 * Crea o promueve personal. SOLO administradores: la identidad sale de la sesión validada en servidor
 * (nunca del formulario) y la función de base de datos vuelve a verificar que el actor sea admin activo.
 */
export async function inviteStaffAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole(["admin"]);
  const parsed = inviteSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const { email, fullName, role, phone, title } = parsed.data;
  if (!(await allow("invite-staff", actor.id, 20, 3600))) return { ok: false, error: TOO_MANY };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();
  let userId = existing?.id as string | undefined;
  if (!userId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/restablecer`,
    });
    if (error || !data.user) {
      console.error("staff.invite", error?.status, error?.code);
      return { ok: false, error: "No pudimos enviar la invitación. Revisa el correo e inténtalo de nuevo." };
    }
    userId = data.user.id;
  }
  const { error } = await admin.rpc("admin_provision_staff", {
    p_actor: actor.id,
    p_user_id: userId,
    p_role: role,
    p_full_name: fullName,
    p_phone: phone || null,
    p_title: title || null,
  });
  if (error) {
    console.error("staff.provision", error.code);
    return { ok: false, error: "No pudimos asignar el rol. Inténtalo de nuevo." };
  }
  revalidatePath("/b/usuarios");
  return {
    ok: true,
    message: existing
      ? "Cuenta existente actualizada con el nuevo rol."
      : "Invitación enviada. La persona define su contraseña desde el correo.",
  };
}

const toggleSchema = z.object({ userId: z.string().uuid(), active: z.enum(["true", "false"]) });
export async function setUserActiveAction(fd: FormData): Promise<void> {
  const actor = await assertRole(["admin"]);
  const parsed = toggleSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return;
  const { error } = await createAdminClient().rpc("admin_set_user_active", {
    p_actor: actor.id,
    p_user_id: parsed.data.userId,
    p_active: parsed.data.active === "true",
  });
  if (error) console.error("staff.toggle", error.code);
  revalidatePath("/b/usuarios");
}
