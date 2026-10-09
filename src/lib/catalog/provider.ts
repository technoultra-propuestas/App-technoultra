import { buildCatalog, parseCsv, type SourceProduct } from "./csv";
import { CATALOG_SOURCE } from "./config";

/**
 * Abstracción de la fuente del catálogo: cambiar de CSV a API/feed no toca la tienda ni el motor de sincronización.
 *   Fuente → CatalogProvider → runCatalogSync (RPC sync_catalog) → Supabase → tienda
 */
export interface CatalogProvider {
  readonly source: string;
  fetchCatalog(): Promise<SourceProduct[]>;
}

export class CatalogSourceError extends Error {
  constructor(
    public readonly reason: "not_configured" | "unavailable" | "invalid",
    message: string,
  ) {
    super(message);
  }
}

/** Proveedor con un CSV ya leído (importación inicial o prueba). */
export const csvTextProvider = (text: string, source = CATALOG_SOURCE): CatalogProvider => ({
  source,
  fetchCatalog: async () => buildCatalog(parseCsv(text)).items,
});

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Fuente automática: un CSV publicado por Excelenter en una URL autorizada (`EXCELENTER_CATALOG_CSV_URL`, solo servidor; p. ej. una hoja
 * publicada o un endpoint con token `EXCELENTER_CATALOG_TOKEN`). Sin la variable NO hay sincronización (no se inventa ninguna API ni se hace scraping).
 */
export function excelenterCsvUrlProvider(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): CatalogProvider {
  return {
    source: CATALOG_SOURCE,
    async fetchCatalog() {
      const url = env.EXCELENTER_CATALOG_CSV_URL;
      if (!url || !/^https:\/\//.test(url)) throw new CatalogSourceError("not_configured", "EXCELENTER_CATALOG_CSV_URL no está configurada.");
      const headers: Record<string, string> = { Accept: "text/csv" };
      if (env.EXCELENTER_CATALOG_TOKEN) headers.Authorization = `Bearer ${env.EXCELENTER_CATALOG_TOKEN}`;
      let res: Response;
      try {
        res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20_000), cache: "no-store" });
      } catch {
        throw new CatalogSourceError("unavailable", "La fuente no respondió.");
      }
      if (!res.ok) throw new CatalogSourceError("unavailable", `La fuente respondió ${res.status}.`);
      const text = await res.text();
      if (text.length > MAX_BYTES) throw new CatalogSourceError("invalid", "La fuente supera el tamaño permitido.");
      // Diagnóstico claro de los errores de conexión más comunes (mensajes fijos: nunca se devuelve el contenido recibido).
      if (text.trim().toLowerCase() === "unauthorized") throw new CatalogSourceError("invalid", "La fuente rechazó la clave del enlace (revisa el parámetro t= y la propiedad TOKEN del script).");
      if (/^\s*<(!doctype|html)/i.test(text)) throw new CatalogSourceError("invalid", "La fuente devolvió una página web en lugar de un CSV (el script debe estar implementado como aplicación web con acceso «Cualquier persona»).");
      try {
        return buildCatalog(parseCsv(text)).items;
      } catch (e) {
        throw new CatalogSourceError("invalid", (e as Error).message);
      }
    },
  };
}
