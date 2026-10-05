"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { allow, TOO_MANY } from "@/lib/auth/rate-limit";
import { fetchAsset, signedUpload, ticketFolder, validateAsset } from "@/lib/cloudinary";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const STAGES = ["reception", "diagnosis", "service", "testing", "delivery"] as const;
const SLOTS = ["front", "back", "screen", "serial", "left", "right", "charger", "damage", "other"] as const;

const signSchema = z.object({
  ticketId: z.string().uuid(),
  stage: z.enum(STAGES),
  slot: z.enum(SLOTS).nullable().optional(),
});

/** Solo el personal que puede gestionar ESTE ticket (RLS: técnico asignado o administrador) y con el ticket abierto. */
async function canUpload(ticketId: string) {
  const profile = await assertRole(["technician", "superadmin"]);
  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("id, status, assigned_to").eq("id", ticketId).is("deleted_at", null).maybeSingle();
  if (!t || ["delivered", "cancelled"].includes(t.status)) return null;
  if (profile.role === "technician" && t.assigned_to !== profile.id) return null;
  return { profile, ticket: t };
}

export type SignResult =
  | { ok: true; cloudName: string; apiKey: string; params: Record<string, string | number>; signature: string; publicId: string }
  | { ok: false; error: string };

/** Firma una subida directa a Cloudinary. El secreto nunca sale del servidor. */
export async function signUploadAction(input: unknown): Promise<SignResult> {
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos no válidos." };
  const ctx = await canUpload(parsed.data.ticketId);
  if (!ctx) return { ok: false, error: "No puedes subir archivos a este ticket." };
  if (!(await allow("upload-sign", ctx.profile.id, 120, 3600))) return { ok: false, error: TOO_MANY };
  try {
    const s = signedUpload(parsed.data.ticketId, parsed.data.stage, parsed.data.slot ?? null);
    return { ok: true, cloudName: s.cloudName, apiKey: s.apiKey, params: s.params, signature: s.signature, publicId: s.fullPublicId };
  } catch {
    return { ok: false, error: "El almacenamiento de fotos aún no está configurado." };
  }
}

const registerSchema = signSchema.extend({
  publicId: z.string().min(10).max(300),
  resourceType: z.enum(["image", "video"]),
});

/**
 * Registra la evidencia SOLO después de verificar en Cloudinary que el archivo existe, es privado, pertenece a la
 * carpeta del ticket y cumple formato/tamaño. La inserción usa service_role porque el cliente no tiene permiso de INSERT.
 */
export async function registerEvidenceAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos no válidos." };
  const v = parsed.data;
  const ctx = await canUpload(v.ticketId);
  if (!ctx) return { ok: false, error: "No puedes subir archivos a este ticket." };
  if (!v.publicId.startsWith(`${ticketFolder(v.ticketId)}/`)) return { ok: false, error: "Archivo no válido." };

  const asset = await fetchAsset(v.publicId, v.resourceType);
  if (!asset) return { ok: false, error: "No pudimos confirmar la subida. Inténtalo de nuevo." };
  const check = validateAsset(asset, v.ticketId);
  if (!check.ok) return { ok: false, error: check.reason === "size" ? "El archivo es demasiado grande." : "Formato de archivo no permitido." };

  const { error } = await createAdminClient().from("evidence").insert({
    ticket_id: v.ticketId,
    stage: v.stage,
    slot: v.slot ?? null,
    media_kind: v.resourceType === "video" ? "video" : "photo",
    cloudinary_public_id: asset.public_id,
    format: asset.format,
    bytes: asset.bytes,
    uploaded_by: ctx.profile.id,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "Ese archivo ya fue registrado." : "No pudimos registrar el archivo." };
  revalidatePath(`/b/tickets/${v.ticketId}`);
  return { ok: true };
}

const deleteSchema = z.object({ ticketId: z.string().uuid(), evidenceId: z.string().uuid() });
export async function removeEvidenceAction(fd: FormData): Promise<void> {
  const p = deleteSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const ctx = await canUpload(p.data.ticketId);
  if (!ctx) return;
  const admin = createAdminClient();
  const q = admin.from("evidence").update({ deleted_at: new Date().toISOString() }).eq("id", p.data.evidenceId).eq("ticket_id", p.data.ticketId);
  // El técnico solo retira lo que él mismo subió; el administrador puede retirar cualquiera.
  await (ctx.profile.role === "superadmin" ? q : q.eq("uploaded_by", ctx.profile.id));
  revalidatePath(`/b/tickets/${p.data.ticketId}`);
}
