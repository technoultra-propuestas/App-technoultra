import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getProfile } from "@/lib/auth/session";
import { BUCKET } from "@/lib/documents/generate";
import { appendSignatureProof } from "@/lib/documents/proof";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const json = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Descarga segura: el documento se transmite por el servidor (no se expone ninguna URL de almacenamiento).
 * La autorización la decide RLS (can_view_document): cambiar el id en la URL no permite ver documentos ajenos.
 * Si el documento está FIRMADO, se añade al final la «Constancia de firma electrónica» (firma, firmante, fecha, canal y huella); los bytes del
 * original no cambian ni su huella (`X-Document-SHA256` es la del original firmado).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await ctx.params).id);
  if (!id.success) return json(404, "No encontrado");
  const profile = await getProfile();
  if (!profile || !profile.is_active) return json(401, "No autenticado");

  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("id, code, version, storage_path, sha256, status").eq("id", id.data).maybeSingle();
  if (!doc) return json(404, "No encontrado");

  const admin = createAdminClient();
  const { data: file, error } = await admin.storage.from(BUCKET).download(doc.storage_path);
  if (error || !file) return json(404, "No encontrado");
  if (profile.role === "client") await supabase.rpc("mark_document_viewed", { p_doc: doc.id });

  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  let signed = false;
  if (doc.status === "signed") {
    // La firma se lee con la sesión de quien consulta (RLS: can_view_document); la imagen, con el servidor.
    const { data: sig } = await supabase.from("document_signatures").select("signer_name, signed_at, consent_text, signature_ref, capture_channel, captured_by, document_sha256").eq("document_id", doc.id).maybeSingle();
    if (sig && sig.document_sha256 === doc.sha256) {
      const [{ data: img }, { data: by }] = await Promise.all([
        admin.storage.from(BUCKET).download(sig.signature_ref),
        sig.captured_by ? admin.from("profiles").select("full_name").eq("id", sig.captured_by).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      try {
        bytes = await appendSignatureProof(bytes, {
          docCode: doc.code,
          docVersion: doc.version,
          docSha256: doc.sha256,
          signerName: sig.signer_name,
          signedAt: new Date(sig.signed_at),
          channel: sig.capture_channel === "assisted" ? "assisted" : "client_session",
          capturedByName: (by as { full_name: string } | null)?.full_name ?? null,
          consentText: sig.consent_text,
          signaturePng: img ? new Uint8Array(await img.arrayBuffer()) : null,
        });
        signed = true;
      } catch (e) {
        console.error("documents.proof", (e as Error).message); // se entrega el original si la constancia falla
      }
    }
  }

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.code}-v${doc.version}${signed ? "-firmado" : ""}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Document-SHA256": doc.sha256,
    },
  });
}
