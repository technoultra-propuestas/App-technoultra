/**
 * Destinos de retorno seguros («volver a donde estabas»). Solo rutas internas de la app: sin esquema, sin host, sin `//`, sin `\`,
 * sin caracteres de control. Evita redirecciones abiertas (open redirect) cuando el destino viaja por la URL o por un formulario.
 */
const ALLOWED_PREFIXES = ["/c/", "/b/", "/tienda", "/avisos"];

export function safeReturnTo(raw: unknown, fallback: string | null = null): string | null {
  if (typeof raw !== "string") return fallback;
  const v = raw.trim();
  if (v.length === 0 || v.length > 300) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return fallback;
  if (!v.startsWith("/") || v.startsWith("//")) return fallback;
  let url: URL;
  try {
    url = new URL(v, "https://app.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "https://app.invalid") return fallback;
  const path = url.pathname;
  if (path.includes("//") || path.split("/").some((s) => s === "..")) return fallback;
  if (!ALLOWED_PREFIXES.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p))) return fallback;
  return path + url.search;
}

/** Agrega o reemplaza un parámetro de consulta en una ruta interna ya validada. */
export function withParam(path: string, key: string, value: string): string {
  const u = new URL(path, "https://app.invalid");
  u.searchParams.set(key, value);
  return u.pathname + u.search;
}
