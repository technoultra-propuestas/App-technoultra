import "server-only";
import { receptionPhotoStatus } from "@/lib/domain/reception";
import { generateTicketDocument, type DocKind } from "@/lib/documents/generate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Documentos que se generan solos al llegar a cada etapa (mejor esfuerzo: un fallo no deshace la transición). */
export async function autoDocuments(ticketId: string, to: string, actorId: string) {
  const wanted: DocKind[] = to === "diagnosing" ? ["reception"] : to === "delivered" ? ["delivery", "warranty_product", "warranty_labor"] : [];
  if (!wanted.length) return;
  const admin = createAdminClient();
  for (const kind of wanted) {
    try {
      const { count } = await admin.from("documents").select("id", { count: "exact", head: true }).eq("ticket_id", ticketId).eq("doc_type", kind);
      if (!count) await generateTicketDocument(kind, ticketId, actorId);
    } catch (e) {
      console.error("documents.auto", kind, (e as Error).message);
    }
  }
}

/**
 * Cuando la recepción está confirmada, las fotos obligatorias completas y el acta firmada (o con excepción autorizada), el ticket pasa solo a «En diagnóstico»: el técnico no
 * tiene que cambiar el estado a mano. Solo actúa sobre tickets en `received` y usa la misma función de base de datos que el cambio
 * manual (`transition_ticket`), que valida rol, asignación y precondiciones: aquí no se decide nada nuevo.
 * Devuelve true si el ticket avanzó.
 */
export async function advanceAfterReception(ticketId: string, actorId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("status").eq("id", ticketId).maybeSingle();
  if (!t || t.status !== "received") return false;
  const [{ count }, { data: ev }] = await Promise.all([
    supabase.from("receptions").select("id", { count: "exact", head: true }).eq("ticket_id", ticketId),
    supabase.from("evidence").select("slot").eq("ticket_id", ticketId).eq("stage", "reception").is("deleted_at", null),
  ]);
  if (!count) return false;
  if (!receptionPhotoStatus((ev ?? []).map((e) => e.slot)).complete) return false;
  // Desde la migración 44 el diagnóstico exige el acta FIRMADA (o una excepción autorizada); la base de datos lo impone, aquí solo se evita el error.
  const [{ data: doc }, { count: exc }] = await Promise.all([
    supabase.from("documents").select("status").eq("ticket_id", ticketId).eq("doc_type", "reception").order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("ticket_exceptions").select("id", { count: "exact", head: true }).eq("ticket_id", ticketId).eq("kind", "reception_signature"),
  ]);
  if (doc?.status !== "signed" && !exc) return false;
  const { error } = await supabase.rpc("transition_ticket", { p_ticket: ticketId, p_to: "diagnosing", p_reason: "Recepción completa: equipo recibido con fotos obligatorias" });
  if (error) return false;
  await autoDocuments(ticketId, "diagnosing", actorId);
  return true;
}
