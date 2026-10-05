import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getProfile } from "@/lib/auth/session";
import { BUCKET } from "@/lib/documents/generate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const json = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Descarga segura: el documento se transmite por el servidor (no se expone ninguna URL de almacenamiento).
 * La autorización la decide RLS (can_view_document): cambiar el id en la URL no permite ver documentos ajenos.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await ctx.params).id);
  if (!id.success) return json(404, "No encontrado");
  const profile = await getProfile();
  if (!profile || !profile.is_active) return json(401, "No autenticado");

  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("id, code, version, storage_path, sha256").eq("id", id.data).maybeSingle();
  if (!doc) return json(404, "No encontrado");

  const { data: file, error } = await createAdminClient().storage.from(BUCKET).download(doc.storage_path);
  if (error || !file) return json(404, "No encontrado");
  if (profile.role === "client") await supabase.rpc("mark_document_viewed", { p_doc: doc.id });

  return new NextResponse(await file.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.code}-v${doc.version}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Document-SHA256": doc.sha256,
    },
  });
}
