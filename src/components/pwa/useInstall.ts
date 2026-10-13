"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { installMode, type InstallMode } from "@/lib/pwa/install";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Win = Window & { __tuInstall?: PromptEvent; __tuInstalled?: boolean };

const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** El evento de instalación lo captura un script temprano del layout (`__tuInstall`); aquí solo se lee y se usa cuando la persona pulsa «Instalar». */
function read(): InstallMode {
  const w = window as Win;
  return installMode({ ua: navigator.userAgent, platform: navigator.platform, touchPoints: navigator.maxTouchPoints, standalone: standalone() || w.__tuInstalled === true, hasPrompt: Boolean(w.__tuInstall) });
}

const subscribe = (cb: () => void) => {
  window.addEventListener("tu:installable", cb);
  window.addEventListener("tu:installed", cb);
  return () => {
    window.removeEventListener("tu:installable", cb);
    window.removeEventListener("tu:installed", cb);
  };
};

export type InstallResult = "accepted" | "dismissed" | null;

export function useInstall() {
  // null en el servidor y durante la hidratación (evita diferencias y parpadeos); después, el estado real del navegador.
  const mode = useSyncExternalStore<InstallMode | null>(subscribe, read, () => null);
  const [result, setResult] = useState<InstallResult>(null);

  /** Abre el diálogo NATIVO de instalación (un solo clic). El navegador solo permite usar el evento una vez. */
  const install = useCallback(async (): Promise<InstallResult> => {
    const w = window as Win;
    const e = w.__tuInstall;
    if (!e) return null;
    await e.prompt();
    const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    w.__tuInstall = undefined;
    if (choice.outcome === "accepted") w.__tuInstalled = true;
    setResult(choice.outcome);
    window.dispatchEvent(new Event("tu:installed")); // vuelve a leer el estado
    return choice.outcome;
  }, []);

  return { mode, result, install };
}
