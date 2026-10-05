import type { AppRole } from "@/lib/auth/types";

export const roleHome = (role: AppRole): string => (role === "client" ? "/c" : "/b");

/** Prefijos que exigen sesión (el proxy hace el control grueso; layouts y acciones hacen el control real). */
export const PROTECTED_PREFIXES = ["/c", "/b", "/onboarding", "/restablecer", "/avisos"] as const;
export const AUTH_PAGES = ["/login", "/registro", "/equipo", "/recuperar", "/verificar"] as const;

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(prefix + "/");

export const isProtectedPath = (pathname: string) => PROTECTED_PREFIXES.some((p) => matches(pathname, p));
export const isAuthPage = (pathname: string) => AUTH_PAGES.some((p) => matches(pathname, p));

/**
 * Anti open-redirect: solo rutas internas absolutas ("/algo"). Rechaza "//host", "/\host", esquemas y control chars.
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (next.length > 300) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const decoded = decodeURIComponent(next);
    if (/[\u0000-\u001f\u007f\\]/.test(decoded) || decoded.startsWith("//")) return fallback;
    const u = new URL(next, "http://x.invalid");
    if (u.origin !== "http://x.invalid") return fallback;
  } catch {
    return fallback;
  }
  return next;
}
