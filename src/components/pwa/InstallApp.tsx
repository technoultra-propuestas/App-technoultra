"use client";

import { useEffect, useState } from "react";
import { IconCheckCircle, IconDownload, IconShare, IconSmartphone } from "@/components/ui/icons";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Mode = "checking" | "installed" | "prompt" | "ios" | "manual";

const deferred = () => (window as unknown as { __tuInstall?: PromptEvent }).__tuInstall;
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * «Instalar TechnoUltra». Solo muestra el botón cuando el navegador REALMENTE ofrece la instalación (evento `beforeinstallprompt`);
 * en iPhone/iPad explica «Compartir → Añadir a pantalla de inicio»; si ya está instalada no insiste. Nunca simula una instalación.
 */
export function InstallApp() {
  const [mode, setMode] = useState<Mode>("checking");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const decide = () => setMode(isStandalone() ? "installed" : deferred() ? "prompt" : isIOS() ? "ios" : "manual");
    const t = setTimeout(decide, 0);
    const onInstalled = () => setMode("installed");
    window.addEventListener("tu:installable", decide);
    window.addEventListener("tu:installed", onInstalled);
    return () => {
      clearTimeout(t);
      window.removeEventListener("tu:installable", decide);
      window.removeEventListener("tu:installed", onInstalled);
    };
  }, []);

  async function install() {
    const e = deferred();
    if (!e) return setMode(isIOS() ? "ios" : "manual");
    await e.prompt();
    const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    (window as unknown as { __tuInstall?: Event }).__tuInstall = undefined; // el aviso solo se puede usar una vez
    if (choice.outcome === "accepted") setMsg("Instalando TechnoUltra… La encontrarás en tu pantalla de inicio o en el escritorio.");
    else {
      setMsg("Cancelaste la instalación. Puedes hacerlo luego desde el menú de tu navegador.");
      setMode("manual");
    }
  }

  if (mode === "checking") return null;
  return (
    <section aria-label="Instalar TechnoUltra" className="flex flex-col gap-2 rounded-card border border-line bg-white p-4 shadow-card">
      <h2 className="m-0 flex items-center gap-2 text-[16px] font-extrabold">
        <IconSmartphone width={20} height={20} /> Instalar TechnoUltra
      </h2>
      {mode === "installed" ? (
        <p className="m-0 flex items-center gap-2 text-[14px] font-semibold text-ok">
          <IconCheckCircle width={18} height={18} /> Ya estás usando TechnoUltra instalada en este dispositivo.
        </p>
      ) : null}
      {mode === "prompt" ? (
        <>
          <p className="m-0 text-[14px] leading-snug text-ink-2">Ábrela desde tu pantalla de inicio o tu escritorio, sin escribir la dirección. Tus datos y tu sesión siguen protegidos igual.</p>
          <button type="button" onClick={install} className="press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-[15px] font-extrabold text-ink">
            <IconDownload width={18} height={18} /> Instalar aplicación
          </button>
        </>
      ) : null}
      {mode === "ios" ? (
        <ol className="m-0 flex flex-col gap-1.5 pl-5 text-[14px] leading-snug text-ink-2">
          <li>
            Abre esta página en <strong>Safari</strong>.
          </li>
          <li>
            Toca <strong>Compartir</strong> <IconShare aria-label="(ícono de compartir)" width={16} height={16} className="inline align-[-3px]" />.
          </li>
          <li>
            Elige <strong>Añadir a pantalla de inicio</strong> y confirma.
          </li>
          <li className="list-none pl-0 text-[12.5px] text-muted">En iPhone y iPad, los avisos del dispositivo solo funcionan con TechnoUltra instalada así (iOS 16.4 o superior).</li>
        </ol>
      ) : null}
      {mode === "manual" ? (
        <p className="m-0 text-[14px] leading-snug text-ink-2">
          Tu navegador no ofrece la instalación directa desde aquí. En <strong>Chrome</strong> o <strong>Edge</strong> usa el menú ⋮ → «Instalar TechnoUltra» (o el ícono de instalar en la barra de direcciones). En <strong>Safari de macOS</strong>: Archivo → «Añadir al Dock».
        </p>
      ) : null}
      {msg ? <p role="status" className="m-0 text-[13px] font-bold text-ink">{msg}</p> : null}
    </section>
  );
}
