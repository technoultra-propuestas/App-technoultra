"use server";

import { revalidatePath } from "next/cache";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { allow, clientIp, TOO_MANY } from "@/lib/auth/rate-limit";
import type { ActionState } from "@/lib/auth/schemas";
import { BUCKET, SIGNABLE } from "@/lib/documents/generate";
import { decodePngDataUrl } from "@/lib/documents/signature";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ documentId: z.string().uuid(), signature: z.string().max(400_000), accept: z.string().optional() });

/**
 * Firma electrónica simple (trazo manuscrito). Se verifica en servidor: dueño del documento, tipo firmable, estado, imagen PNG real
 * y límites de tamaño. La evidencia (usuario, fecha/hora, versión, hash del documento, consentimiento, IP y agente) es inmutable.
 * No equivale por sí sola a una firma digital certificada (Ley 527/1999); la validez final debe revisarla un abogado.
 */
export async function signDocumentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const profile = await assertRole(["client"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: "Datos no válidos." };
  if (parsed.data.accept !== "on") return { ok: false, error: "Debes confirmar que leíste y aceptas el documento." };
  if (!(await allow("doc-sign", profile.id, 10, 3600))) return { ok: false, error: TOO_MANY };

  const png = decodePngDataUrl(parsed.data.signature);
  if (!png) return { ok: false, error: "No pudimos leer tu firma. Dibújala de nuevo." };

  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("id, code, version, doc_type, status, sha256, customer_id, customers(full_name)").eq("id", parsed.data.documentId).maybeSingle();
  if (!doc) return { ok: false, error: "Documento no encontrado." };
  if (!(SIGNABLE as string[]).includes(doc.doc_type)) return { ok: false, error: "Este documento no requiere firma." };
  if (!["generated", "sent", "viewed"].includes(doc.status)) return { ok: false, error: "Este documento ya no se puede firmar." };

  const admin = createAdminClient();
  const path = `signatures/${doc.id}/${profile.id}.png`;
  const up = await admin.storage.from(BUCKET).upload(path, png, { contentType: "image/png", upsert: false });
  if (up.error) return { ok: false, error: "No pudimos guardar tu firma. Inténtalo de nuevo." };

  const name = (doc.customers as unknown as { full_name: string } | null)?.full_name ?? profile.full_name;
  const h = await headers();
  const ip = await clientIp();
  const { error } = await admin.from("document_signatures").insert({
    document_id: doc.id,
    signer_profile_id: profile.id,
    signer_name: name,
    consent_text: `Yo, ${name}, confirmo que leí y acepto el documento ${doc.code} (versión ${doc.version}, huella SHA-256 ${doc.sha256.slice(0, 16)}...).`,
    signature_ref: path,
    document_sha256: doc.sha256,
    ip: isIP(ip) ? ip : null,
    user_agent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error.message.includes("document_hash_mismatch") ? "El documento cambió. Recarga la página." : "No pudimos registrar tu firma." };
  }
  revalidatePath(`/c/documentos/${doc.id}`);
  revalidatePath("/c/documentos");
  return { ok: true, message: "Documento firmado. Guardamos tu firma y la huella del documento." };
}

export async function rejectDocumentAction(fd: FormData): Promise<void> {
  await assertRole(["client"]);
  const id = z.string().uuid().safeParse(fd.get("documentId"));
  if (!id.success) return;
  await (await createClient()).rpc("reject_document", { p_doc: id.data });
  revalidatePath(`/c/documentos/${id.data}`);
}
