/**
 * Borradores de formularios (persistencia local, SOLO datos no sensibles).
 * Lógica pura y comprobable; el componente `FormDraft` la usa en el navegador.
 *  · Clave = usuario + ruta + formulario (nunca se mezclan borradores de personas, pantallas o formularios distintos).
 *  · Vencen (24 h por defecto) y se borran al enviar con éxito y al cerrar sesión.
 *  · Jamás se guardan contraseñas, códigos, tokens, secretos, tarjetas, documentos de identidad ni archivos.
 */
export const DRAFT_PREFIX = "tu:draft:v1:";
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FIELD = 5000;
const MAX_TOTAL = 30_000;

const SENSITIVE_NAME = /pass|pwd|clave|token|secret|otp|totp|code|codigo|pin\b|cvv|cvc|card|tarjeta|iban|document|cedula|nit\b|signature|firma/i;
const SKIP_TYPES = new Set(["password", "file", "hidden", "submit", "button", "reset", "image"]);

/** ¿Este campo puede guardarse en el borrador? */
export const shouldPersist = (name: string, type: string): boolean => Boolean(name) && !SKIP_TYPES.has(type) && !SENSITIVE_NAME.test(name) && !name.startsWith("$ACTION");

export const draftKey = (scope: string, path: string, formId: string) => `${DRAFT_PREFIX}${scope || "anon"}:${path.split("?")[0]}:${formId}`;

export type Draft = { at: number; v: Record<string, string> };

/** Recorta y limpia los valores a guardar (tamaño máximo por campo y en total). */
export function buildDraft(values: Record<string, string>, now = Date.now()): Draft | null {
  const v: Record<string, string> = {};
  let total = 0;
  for (const [k, raw] of Object.entries(values)) {
    const val = String(raw).slice(0, MAX_FIELD);
    if (val === "") continue;
    total += val.length;
    if (total > MAX_TOTAL) break;
    v[k] = val;
  }
  return Object.keys(v).length ? { at: now, v } : null;
}

/** Lee un borrador serializado; devuelve null si está vencido, corrupto o con forma inesperada. */
export function parseDraft(raw: string | null, now = Date.now(), ttl = DRAFT_TTL_MS): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Draft;
    if (!d || typeof d.at !== "number" || typeof d.v !== "object" || d.v === null) return null;
    if (now - d.at > ttl || d.at > now + 60_000) return null;
    const v: Record<string, string> = {};
    for (const [k, val] of Object.entries(d.v)) if (typeof val === "string" && !SENSITIVE_NAME.test(k)) v[k] = val.slice(0, MAX_FIELD);
    return Object.keys(v).length ? { at: d.at, v } : null;
  } catch {
    return null;
  }
}

/** Borra todos los borradores (cierre de sesión) o solo los de una persona. */
export function clearAllDrafts(storage: Pick<Storage, "length" | "key" | "removeItem">, scope?: string) {
  const prefix = scope ? `${DRAFT_PREFIX}${scope}:` : DRAFT_PREFIX;
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(prefix)) doomed.push(k);
  }
  for (const k of doomed) storage.removeItem(k);
}
