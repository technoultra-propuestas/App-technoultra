/**
 * Decisión pura (sin DOM) de cómo ofrecer la instalación de TechnoUltra. Honestidad técnica:
 *  - Android/escritorio con Chrome/Edge: existe `beforeinstallprompt` → un botón «Instalar» abre el diálogo nativo con un clic.
 *  - iPhone/iPad: NO existe API web para instalar; solo se pueden dar instrucciones breves (Compartir → Añadir a pantalla de inicio).
 *  - Ya instalada (modo standalone): no se muestra nada.
 *  - Sin evento y sin iOS: no se presenta un botón engañoso; solo una alternativa contextual (menú del navegador) en la sección «Más».
 */
export type InstallEnv = { ua: string; platform: string; touchPoints: number; standalone: boolean; hasPrompt: boolean };
export type InstallMode = "installed" | "prompt" | "ios-safari" | "ios-other" | "manual";

/** iPhone/iPad (incluido iPadOS, que se presenta como Mac con pantalla táctil). */
export function isIOS(ua: string, platform: string, touchPoints: number): boolean {
  return /iphone|ipad|ipod/i.test(ua) || (platform === "MacIntel" && touchPoints > 1);
}

/** Safari real: sin otro navegador ni «webview» de una app (Instagram, Facebook…), que no pueden añadir a la pantalla de inicio. */
export function isIOSSafari(ua: string): boolean {
  return /safari\//i.test(ua) && !/crios|fxios|edgios|opios|fbav|fban|instagram|line\/|gsa\//i.test(ua);
}

export function installMode(e: InstallEnv): InstallMode {
  if (e.standalone) return "installed";
  if (e.hasPrompt) return "prompt";
  if (isIOS(e.ua, e.platform, e.touchPoints)) return isIOSSafari(e.ua) ? "ios-safari" : "ios-other";
  return "manual";
}

/** ¿Debe mostrarse la invitación flotante? Solo cuando hay algo accionable de verdad (diálogo nativo o instrucciones de iOS). */
export const bannerVisible = (mode: InstallMode): boolean => mode === "prompt" || mode === "ios-safari" || mode === "ios-other";

export const QUIET_DAYS = 14;
/** Tras descartar el aviso no vuelve a aparecer durante `QUIET_DAYS`. */
export function recentlyDismissed(stamp: number | null, now: number): boolean {
  return stamp !== null && Number.isFinite(stamp) && stamp > 0 && now - stamp < QUIET_DAYS * 24 * 3600_000;
}
