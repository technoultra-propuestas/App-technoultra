"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { allow, TOO_MANY } from "@/lib/auth/rate-limit";
import { phoneCO, zodToState, type ActionState } from "@/lib/auth/schemas";
import { sendNotificationEmail } from "@/lib/email";
import { getPublicEnv } from "@/lib/env.public";
import { createAdminClient } from "@/lib/supabase/admin";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un correo válido.").max(254),
  fullName: z.string().trim().min(3, "Escribe el nombre completo.").max(120),
  role: z.literal("technician"),
  phone: z.union([z.literal(""), phoneCO]).optional(),
  title: z.string().trim().max(80).optional(),
});

/**
 * Crea o promueve personal. SOLO administradores con MFA (aal2): la identidad sale de la sesión validada en servidor (nunca del
 * formulario) y la función de base de datos vuelve a verificar que el actor sea admin activo, impide cambiar el propio rol y
 * deja auditoría. El acceso se entrega con un enlace propio por correo (crear contraseña) y luego la persona configura su MFA.
 */
export async function inviteStaffAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole(["superadmin"]);
  const parsed = inviteSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const { email, fullName, role, phone, title } = parsed.data;
  if (!(await allow("invite-staff", actor.id, 20, 3600))) return { ok: false, error: TOO_MANY };

  const admin = createAdminClient();
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).is("deleted_at", null).maybeSingle();
  let userId = existing?.id as string | undefined;
  if (!userId) {
    // Alta por el backend: correo ya confirmado y sin contraseña. El rol lo asigna la base de datos, nunca el navegador.
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error || !data.user) {
      console.error("staff.create", error?.status, error?.code);
      return { ok: false, error: "No pudimos crear la cuenta. Revisa el correo e inténtalo de nuevo." };
    }
    userId = data.user.id;
  }
  const { error } = await admin.rpc("admin_provision_staff", {
    p_actor: actor.id,
    p_user_id: userId,
    p_role: role,
    p_full_name: fullName,
    p_phone: phone || undefined,
    p_title: title || undefined,
  });
  if (error) {
    console.error("staff.provision", error.code);
    const msg = error.message.includes("cannot_change_own_role")
      ? "No puedes cambiar tu propio rol."
      : error.message.includes("last_admin")
        ? "Debe quedar al menos un administrador."
        : "No pudimos asignar el rol. Inténtalo de nuevo.";
    return { ok: false, error: msg };
  }

  // Enlace de acceso propio (no depende de las plantillas de Auth): /auth/confirm → crear contraseña → MFA.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const hashed = link?.properties?.hashed_token;
  let delivered = false;
  if (!linkErr && hashed) {
    const url = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=recovery&next=${encodeURIComponent("/gestion/restablecer")}`;
    const first = fullName.split(" ")[0];
    const sent = await sendNotificationEmail(
      email,
      {
        title: "Tu acceso a TechnoUltra Gestión",
        body: `Hola ${first}, te dimos acceso como técnico de TechnoUltra. Crea tu contraseña con el botón; después configurarás tu verificación en dos pasos con una app autenticadora. Si no esperabas este correo, ignóralo.`,
        ctaLabel: "Crear mi contraseña",
        ctaUrl: url,
      },
      `staff-invite-${userId}-${Date.now()}`,
    );
    delivered = sent.sent;
  } else if (linkErr) {
    console.error("staff.link", linkErr.status, linkErr.code);
  }
  revalidatePath("/b/usuarios");
  return {
    ok: true,
    message: delivered
      ? "Cuenta lista. Enviamos el correo para crear la contraseña y configurar la verificación en dos pasos."
      : "Cuenta lista, pero no pudimos enviar el correo. La persona puede usar «¿Olvidaste tu contraseña?» en el acceso de personal.",
  };
}

const toggleSchema = z.object({ userId: z.string().uuid(), active: z.enum(["true", "false"]) });
export async function setUserActiveAction(fd: FormData): Promise<void> {
  const actor = await assertRole(["superadmin"]);
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

const resetSchema = z.object({ userId: z.string().uuid() });
/**
 * Restablece la verificación en dos pasos de otra persona del equipo (teléfono perdido). Solo administración con aal2 y nunca sobre
 * uno mismo. Elimina los factores en Supabase Auth: en su próximo ingreso deberá configurarlo de nuevo. Queda auditado.
 */
export async function resetStaffMfaAction(fd: FormData): Promise<void> {
  const actor = await assertRole(["superadmin"]);
  const parsed = resetSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success || parsed.data.userId === actor.id) return;
  if (!(await allow("mfa-reset", actor.id, 10, 3600))) return;
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id, role").eq("id", parsed.data.userId).maybeSingle();
  if (!target || target.role === "client") return;
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: target.id });
  for (const f of factors?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: target.id });
  await admin.rpc("log_admin_event", { p_actor: actor.id, p_event: "superadmin.security_changed", p_target: target.id, p_metadata: { scope: "mfa_reset" } });
  revalidatePath("/b/usuarios");
}
