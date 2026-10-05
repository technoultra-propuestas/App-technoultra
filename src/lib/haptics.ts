"use client";

/**
 * Retroalimentación háptica progresiva: usa la API de vibración solo si existe (no en iOS Safari) y respeta
 * `prefers-reduced-motion`. Nunca lanza errores ni condiciona una funcionalidad.
 */
export function haptic(kind: "tap" | "success" | "error" = "tap") {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate(kind === "tap" ? 10 : kind === "success" ? [12, 40, 12] : [30, 40, 30]);
  } catch {
    /* sin soporte: silencio */
  }
}
