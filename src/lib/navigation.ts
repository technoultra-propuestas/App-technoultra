/**
 * Destinos de retorno seguros («volver a donde estabas»). Solo rutas internas de la app: sin esquema, sin host, sin `//`, sin `\`,
 * sin caracteres de control. Evita redirecciones abiertas (open redirect) cuando el destino viaja por la URL o por un formulario.
 */
const ALLOWED_PREFIXES = ["/c/", "/b/", "/tienda", "/notificaciones"];

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

/** Texto de la flecha «volver» según el destino real (ticket, cotización, lista…). */
export function backLabel(path: string): string {
  const p = path.split("?")[0];
  if (/^\/c\/tickets\/[^/]+\/cotizacion$/.test(p)) return "Volver a la cotización";
  if (/^\/c\/tickets\/[^/]+$/.test(p)) return "Volver a mi servicio";
  if (p === "/c/tickets") return "Volver a mis servicios";
  if (/^\/c\/documentos\/[^/]+$/.test(p)) return "Volver al documento";
  if (p === "/c/documentos") return "Volver a mis documentos";
  if (/^\/b\/tickets\/[^/]+$/.test(p)) return "Volver al ticket";
  if (p === "/b/tickets") return "Volver a tickets";
  if (p === "/notificaciones") return "Volver a notificaciones";
  if (p === "/c" || p === "/b") return "Volver al inicio";
  return "Volver";
}

/**
 * Destino de la flecha «volver»: el contexto real desde el que se abrió la pantalla (`?from=`, ruta interna validada) y, si no hay (enlace directo,
 * pestaña nueva), un destino por defecto fiable. No depende de `history.back()`: sirve aunque no exista una página anterior.
 */
export function backTarget(from: unknown, fallback: { href: string; label: string }): { href: string; label: string } {
  const safe = safeReturnTo(from);
  return safe ? { href: safe, label: backLabel(safe) } : fallback;
}

/** Enlace a la ficha de un documento abierto DESDE un ticket del cliente: la flecha «volver» regresa a ese ticket. */
export const clientDocHref = (docId: string, fromTicketId: string): string => `/c/documentos/${docId}?from=${encodeURIComponent(`/c/tickets/${fromTicketId}`)}`;
