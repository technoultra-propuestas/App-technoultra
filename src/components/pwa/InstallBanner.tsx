"use client";

import { useEffect, useState } from "react";
import { IconDownload, IconShare, IconXCircle } from "@/components/ui/icons";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const KEY = "tu-install-dismissed";
const QUIET_DAYS = 30;
const deferred = () => (window as unknown as { __tuInstall?: PromptEvent }).__tuInstall;
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function recentlyDismissed(): boolean {
  try {
    const t = Number(localStorage.getItem(KEY));
    return Number.isFinite(t) && t > 0 && Date.now() - t < QUIET_DAYS * 24 * 3600_000;
  } catch {
    return false;
  }
}

/**
 * Invitación DISCRETA a instalar TechnoUltra, solo dentro de la aplicación con sesión (no en páginas públicas). Aparece tras 20 s de uso,
 * solo si el navegador ofrece de verdad la instalación (Android/escritorio) o en iPhone/iPad (con las instrucciones), nunca si ya está
 * instalada, y se puede descartar: no vuelve a aparecer durante 30 días.
 */
export function InstallBanner() {
  const [mode, setMode] = useState<"hidden" | "prompt" | "ios">("hidden");
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (standalone() || recentlyDismissed()) return;
    const decide = () => setMode(deferred() ? "prompt" : ios() ? "ios" : "hidden");
    const t = setTimeout(decide, 20_000);
    const onInstallable = () => !recentlyDismissed() && setTimeout(decide, 20_000);
    const onInstalled = () => setMode("hidden");
    window.addEventListener("tu:installable", onInstallable);
    window.addEventListener("tu:installed", onInstalled);
    return () => {
      clearTimeout(t);
      window.removeEventListener("tu:installable", onInstallable);
      window.removeEventListener("tu:installed", onInstalled);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* sin almacenamiento: solo se oculta ahora */
    }
    setMode("hidden");
  }
  async function install() {
    const e = deferred();
    if (!e) return setHelp(true);
    await e.prompt();
    const c = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    (window as unknown as { __tuInstall?: Event }).__tuInstall = undefined;
    if (c.outcome === "dismissed") dismiss();
    else setMode("hidden");
  }

  if (mode === "hidden") return null;
  return (
    <aside aria-label="Instalar TechnoUltra" className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[460px] flex-col gap-2 rounded-card border border-line bg-white p-3.5 shadow-pop lg:bottom-4 lg:left-auto lg:right-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-ink text-brand">
          <IconDownload width={20} height={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14.5px] font-extrabold leading-tight">Instala TechnoUltra</span>
          <span className="text-[12.5px] leading-snug text-ink-2">Ábrela desde tu pantalla de inicio, sin escribir la dirección.</span>
        </div>
        <button type="button" onClick={dismiss} aria-label="Ahora no" className="flex h-11 w-11 flex-none items-center justify-center text-muted">
          <IconXCircle width={20} height={20} />
        </button>
      </div>
      {mode === "prompt" ? (
        <button type="button" onClick={() => void install()} className="press min-h-11 rounded-[12px] bg-brand px-4 text-[14px] font-extrabold text-ink">
          Instalar aplicación
        </button>
      ) : (
        <>
          <button type="button" onClick={() => setHelp((v) => !v)} aria-expanded={help} className="press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[12px] bg-brand px-4 text-[14px] font-extrabold text-ink">
            <IconShare width={16} height={16} /> Cómo instalarla
          </button>
          {help ? (
            <ol className="m-0 flex flex-col gap-1 pl-5 text-[13px] leading-snug text-ink-2">
              <li>Abre esta página en <strong>Safari</strong>.</li>
              <li>Toca <strong>Compartir</strong> y elige <strong>Añadir a pantalla de inicio</strong>.</li>
            </ol>
          ) : null}
        </>
      )}
    </aside>
  );
}
