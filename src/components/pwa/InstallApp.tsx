"use client";

import { IconCheckCircle, IconDownload, IconShare, IconSmartphone } from "@/components/ui/icons";
import { useInstall } from "./useInstall";

/**
 * «Instalar TechnoUltra» (sección «Más»). Con el diálogo nativo disponible, «Instalar» lo abre con un clic; en iPhone/iPad explica
 * «Compartir → Añadir a pantalla de inicio» (iOS no ofrece instalación por API); si ya está instalada no insiste; si el navegador no
 * ofrece nada, indica dónde está la opción en su menú. Nunca simula una instalación.
 */
export function InstallApp() {
  const { mode, result, install } = useInstall();
  if (!mode) return null;
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
          <button type="button" onClick={() => void install()} className="press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-[15px] font-extrabold text-ink">
            <IconDownload width={18} height={18} /> Instalar
          </button>
        </>
      ) : null}
      {mode === "ios-safari" || mode === "ios-other" ? (
        <ol className="m-0 flex flex-col gap-1.5 pl-5 text-[14px] leading-snug text-ink-2">
          {mode === "ios-other" ? (
            <li>
              Abre esta página en <strong>Safari</strong>.
            </li>
          ) : null}
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
      {result === "accepted" ? <p role="status" className="m-0 text-[13px] font-bold text-ink">Instalando TechnoUltra… La encontrarás en tu pantalla de inicio o en el escritorio.</p> : null}
      {result === "dismissed" ? <p role="status" className="m-0 text-[13px] font-bold text-ink">Cancelaste la instalación. Puedes hacerlo luego con el botón o desde el menú de tu navegador.</p> : null}
    </section>
  );
}
