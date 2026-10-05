"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ id: z.string().uuid(), confirm: z.literal("ANONIMIZAR") });

/**
 * Supresión de datos personales (Ley 1581): la base de datos anonimiza la ficha, direcciones y equipos (solo administración,
 * bloquea si hay trabajo abierto) y aquí se bloquea la cuenta de acceso para que no pueda volver a iniciar sesión.
 */
export async function anonymizeCustomerAction(fd: FormData): Promise<void> {
  await assertRole(["admin"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { data: profileId, error } = await supabase.rpc("anonymize_customer", { p_customer: parsed.data.id });
  if (error) {
    console.error("privacy.anonymize", error.code, error.message);
    return;
  }
  if (profileId) {
    const { error: banErr } = await createAdminClient().auth.admin.updateUserById(profileId as string, { ban_duration: "876000h" });
    if (banErr) console.error("privacy.ban", banErr.status);
  }
  revalidatePath("/b/privacidad");
}
