"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { phoneCO, zodToState, type ActionState } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    fullName: z.string().trim().min(3, "Escribe tu nombre completo.").max(120),
    phone: phoneCO,
    documentType: z.union([z.literal(""), z.enum(["CC", "CE", "NIT", "PP", "TI"])]).optional(),
    documentNumber: z.string().trim().max(20).optional(),
    companyName: z.string().trim().max(160).optional(),
  })
  .refine((v) => !v.documentType === !v.documentNumber, {
    message: "Completa el tipo y el número de documento.",
    path: ["documentNumber"],
  })
  .refine((v) => !v.documentNumber || /^[0-9A-Za-z-]{5,20}$/.test(v.documentNumber), {
    message: "Documento no válido.",
    path: ["documentNumber"],
  });

export async function updateProfileAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const profile = await assertRole(["client"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { error: e1 } = await supabase
    .from("profiles")
    .update({ full_name: v.fullName })
    .eq("id", profile.id);
  const { error: e2 } = await supabase
    .from("customers")
    .update({
      full_name: v.fullName,
      phone: v.phone,
      document_type: v.documentType || null,
      document_number: v.documentNumber || null,
      company_name: v.companyName || null,
    })
    .eq("profile_id", profile.id);
  if (e1 || e2) {
    const dup = e2?.code === "23505";
    return {
      ok: false,
      error: dup
        ? "Ese celular o documento ya está registrado en otra cuenta."
        : "No pudimos guardar tus datos.",
    };
  }
  revalidatePath("/c/perfil");
  return { ok: true, message: "Datos guardados." };
}

const prefsSchema = z.object({ email: z.string().optional(), inApp: z.string().optional() });
export async function updatePreferencesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const profile = await assertRole(["client"]);
  const v = prefsSchema.parse(Object.fromEntries(fd.entries()));
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      { profile_id: profile.id, email_enabled: v.email === "on", in_app_enabled: true },
      { onConflict: "profile_id" },
    );
  if (error) return { ok: false, error: "No pudimos guardar tus preferencias." };
  revalidatePath("/c/perfil");
  return { ok: true, message: "Preferencias guardadas." };
}
