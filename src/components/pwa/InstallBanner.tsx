"use client";

import { useEffect, useState } from "react";
import { IconDownload, IconShare, IconXCircle } from "@/components/ui/icons";
import { bannerVisible, recentlyDismissed } from "@/lib/pwa/install";
import { useInstall } from "./useInstall";

const KEY = "tu-install-dismissed";
const SHOW_AFTER_MS = 3000;

const readStamp = (): number | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
};

/**
 * Invitación a instalar TechnoUltra, solo dentro de la aplicación con sesión. Con el diálogo nativo disponible (Android/escritorio) el botón
 * «Instalar» lo abre con un clic; en iPhone/iPad no existe esa API y se muestran, ya visibles, las dos instrucciones de Safari. Nunca aparece
 * si ya está instalada, se puede descartar (no vuelve en 14 días) y no tapa botones ni la barra inferior.
 */
export function InstallBanner() {
  const { mode, result, install } = useInstall();
  const [ready, setReady] = useState(false);
  // Se lee una sola vez; en el servidor no hay almacenamiento y el aviso ni siquiera se dibuja hasta pasar `SHOW_AFTER_MS`.
  const [quiet, setQuiet] = useState(() => typeof window === "undefined" || recentlyDismissed(readStamp(), Date.now()));
  const [shown, setShown] = useState(true); // false al terminar de informar el resultado de la instalación
  const note = !shown ? "" : result === "accepted" ? "Instalando TechnoUltra… la encontrarás en tu pantalla de inicio." : result === "dismissed" ? "Instalación cancelada. Puedes hacerlo cuando quieras desde «Más»." : "";

  useEffect(() => {
    const t = setTimeout(() => setReady(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* sin almacenamiento: solo se oculta ahora */
    }
    setQuiet(true);
  }

  // Con el resultado de la instalación se informa unos segundos y luego se retira.
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setShown(false), 5000);
    return () => clearTimeout(t);
  }, [result]);

  if (note) {
    return (
      <aside role="status" aria-label="Instalar TechnoUltra" className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[460px] rounded-card border border-line bg-white p-3.5 text-[14px] font-bold shadow-pop lg:bottom-4 lg:left-auto lg:right-4">
        {note}
      </aside>
    );
  }
  if (result === "dismissed" && !shown) return null;
  if (!ready || quiet || !mode || !bannerVisible(mode)) return null;
  return (
    <aside aria-label="Instalar TechnoUltra" data-install-mode={mode} className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[460px] flex-col gap-2 rounded-card border border-line bg-white p-3.5 shadow-pop lg:bottom-4 lg:left-auto lg:right-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-ink text-brand">
          <IconDownload width={20} height={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14.5px] font-extrabold leading-tight">Instalar TechnoUltra</span>
          <span className="text-[12.5px] leading-snug text-ink-2">Ábrela desde tu pantalla de inicio y recibe avisos en tu dispositivo.</span>
        </div>
        <button type="button" onClick={dismiss} aria-label="Ahora no" className="flex h-11 w-11 flex-none items-center justify-center text-muted">
          <IconXCircle width={20} height={20} />
        </button>
      </div>
      {mode === "prompt" ? (
        <button type="button" onClick={() => void install()} className="press min-h-11 rounded-[12px] bg-brand px-4 text-[14px] font-extrabold text-ink">
          Instalar
        </button>
      ) : (
        <ol className="m-0 flex flex-col gap-1 pl-5 text-[13px] leading-snug text-ink-2">
          {mode === "ios-other" ? (
            <li>
              Abre esta página en <strong>Safari</strong>.
            </li>
          ) : null}
          <li>
            Toca <strong>Compartir</strong> <IconShare aria-label="(ícono de compartir)" width={15} height={15} className="inline align-[-3px]" />.
          </li>
          <li>
            Elige <strong>Añadir a pantalla de inicio</strong>.
          </li>
        </ol>
      )}
    </aside>
  );
}
