import { CatalogSourceError, type CatalogProvider } from "./provider";

/** Lo mínimo del cliente de Supabase que necesita el motor (acepta el cliente admin del servidor o el de un script). */
export type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };

export type SyncOutcome =
  | { ok: true; status: "success" | "partial"; summary: Record<string, unknown> }
  | { ok: false; status: "error"; reason: string; detail?: string; summary?: Record<string, unknown> };

/**
 * Ejecuta una sincronización completa. Reglas: si la fuente falla NO se toca el catálogo (se conserva el último estado válido) y se registra el error;
 * si responde, la base de datos (`sync_catalog`) aplica los cambios de forma atómica, idempotente y auditable.
 */
export async function runCatalogSync(client: RpcClient, provider: CatalogProvider, runType: "manual" | "automatic" | "import", actor?: string | null): Promise<SyncOutcome> {
  let items;
  try {
    items = await provider.fetchCatalog();
  } catch (e) {
    const reason = e instanceof CatalogSourceError ? e.reason : "unavailable";
    // Fuente aún no conectada y ejecución automática: no hay nada que registrar (evita una alerta diaria sin sentido).
    if (reason === "not_configured" && runType === "automatic") return { ok: false, status: "error", reason };
    await client.rpc("record_catalog_sync_failure", { p_source: provider.source, p_run_type: runType, p_reason: reason, p_actor: actor ?? null });
    // `detail` = mensaje fijo de la fuente (sin contenido recibido ni URL); lo ve solo quien ejecuta la sincronización autorizada.
    return { ok: false, status: "error", reason, detail: e instanceof CatalogSourceError ? e.message : undefined };
  }
  const { data, error } = await client.rpc("sync_catalog", { p_source: provider.source, p_items: items, p_run_type: runType, p_actor: actor ?? null });
  if (error) {
    console.error("catalog.sync", error.code);
    await client.rpc("record_catalog_sync_failure", { p_source: provider.source, p_run_type: runType, p_reason: "database_error", p_actor: actor ?? null });
    return { ok: false, status: "error", reason: "database_error" };
  }
  const summary = (data ?? {}) as Record<string, unknown>;
  if (summary.status === "error") return { ok: false, status: "error", reason: String(summary.reason ?? "rejected"), summary };
  return { ok: true, status: summary.status === "partial" ? "partial" : "success", summary };
}
