import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Auditoría de eventos administrativos (lista cerrada en la BD; sin datos sensibles). El actor debe ser un administrador activo. */
export async function auditAdmin(actorId: string, event: "superadmin.settings_changed" | "superadmin.security_changed", target?: string, metadata: Record<string, string> = {}) {
  const { error } = await createAdminClient().rpc("log_admin_event", { p_actor: actorId, p_event: event, p_target: target ?? null, p_metadata: metadata });
  if (error) console.error("admin.audit", event, error.code);
}
