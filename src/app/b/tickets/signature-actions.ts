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

const sign = z.object({ documentId: z.string().uuid(), signature: z.string().max(400_000), accept: z.string().optional() });

/**
 * Firma presencial: el cliente dibuja SU firma en el dispositivo del personal. El personal NUNCA firma en nombre del cliente: la casilla
 * confirma que el cliente leyó el acta y firma personalmente, y la constancia deja el canal («assisted») y quién prestó el dispositivo.
 * Misma validación que la firma desde la sesión del cliente (PNG real, versión/huella exactas, documento firmable y aún vigente).
 */
export async function captureClientSignatureAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole(["technician", "superadmin"]);
  const parsed = sign.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: "Datos no válidos." };
  if (parsed.data.accept !== "on") return { ok: false, error: "Confirma que el cliente leyó el acta y firma personalmente." };
  if (!(await allow("doc-sign-assisted", actor.id, 20, 3600))) return { ok: false, error: TOO_MANY };
  const png = decodePngDataUrl(parsed.data.signature);
  if (!png) return { ok: false, error: "No pudimos leer la firma. Pídele al cliente que la dibuje de nuevo." };

  // RLS: un técnico solo ve documentos de sus tickets; el administrador ve todos.
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, code, version, doc_type, status, sha256, ticket_id, customers(full_name, profile_id)")
    .eq("id", parsed.data.documentId)
    .maybeSingle();
  if (!doc) return { ok: false, error: "Documento no encontrado." };
  if (!(SIGNABLE as string[]).includes(doc.doc_type)) return { ok: false, error: "Este documento no requiere firma." };
  if (!["generated", "sent", "viewed"].includes(doc.status)) return { ok: false, error: "Este documento ya no se puede firmar." };

  const cust = doc.customers as unknown as { full_name: string; profile_id: string | null } | null;
  const name = cust?.full_name ?? "Cliente";
  const admin = createAdminClient();
  const path = `signatures/${doc.id}/assisted-${Date.now()}.png`;
  const up = await admin.storage.from(BUCKET).upload(path, png, { contentType: "image/png", upsert: false });
  if (up.error) return { ok: false, error: "No pudimos guardar la firma. Inténtalo de nuevo." };

  const h = await headers();
  const ip = await clientIp();
  const { error } = await admin.from("document_signatures").insert({
    document_id: doc.id,
    signer_profile_id: cust?.profile_id ?? null,
    signer_name: name,
    capture_channel: "assisted",
    captured_by: actor.id,
    consent_text: `Yo, ${name}, confirmo que leí y acepto el documento ${doc.code} (versión ${doc.version}, huella SHA-256 ${doc.sha256.slice(0, 16)}...). Firmé personalmente en el dispositivo de ${actor.full_name}.`,
    signature_ref: path,
    document_sha256: doc.sha256,
    ip: isIP(ip) ? ip : null,
    user_agent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error.message.includes("document_hash_mismatch") ? "El documento cambió. Recarga la página." : "No pudimos registrar la firma." };
  }
  revalidatePath(`/b/tickets/${doc.ticket_id}`);
  revalidatePath("/b/tickets");
  return { ok: true, message: "Firma registrada. El acta quedó firmada por el cliente." };
}

const exc = z.object({ ticketId: z.string().uuid(), reason: z.string().trim().min(5, "Explica el motivo (mínimo 5 caracteres).").max(500) });

/** Solo el SUPERADMIN puede autorizar continuar sin la firma del acta; queda registrado con motivo, autor y avisos. */
export async function authorizeReceptionExceptionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole(["superadmin"]);
  const parsed = exc.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const { error } = await createAdminClient().rpc("authorize_reception_exception", { p_actor: actor.id, p_ticket: parsed.data.ticketId, p_reason: parsed.data.reason });
  if (error) {
    const m = error.message;
    return { ok: false, error: m.includes("already_signed") ? "El acta ya está firmada." : m.includes("reception_missing") ? "Primero confirma la recepción." : m.includes("not_waiting") ? "El ticket ya no está esperando la recepción." : "No pudimos autorizar la excepción." };
  }
  revalidatePath(`/b/tickets/${parsed.data.ticketId}`);
  revalidatePath("/b/tickets");
  return { ok: true, message: "Excepción autorizada. El ticket pasó a diagnóstico." };
}
