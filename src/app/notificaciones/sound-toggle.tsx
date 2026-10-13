"use client";

import { useState, useSyncExternalStore } from "react";
import { playChime, setSoundEnabled, soundEnabled, subscribeSound } from "@/components/pwa/NotificationSound";

/** Interruptor opt-in del timbre dentro de la app. Dice con claridad qué hace y qué no (no controla el sonido del sistema). */
export function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, soundEnabled, () => false);
  const [note, setNote] = useState("");

  async function toggle() {
    const next = !on;
    setSoundEnabled(next);
    if (next) setNote((await playChime()) ? "Así sonará con la app abierta." : "Tu navegador no permitió reproducir audio. Toca de nuevo para probar.");
    else setNote("");
  }

  return (
    <section className="flex flex-col gap-2 rounded-card border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[16px] font-extrabold">Sonido con la app abierta</h2>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={toggle}
          className={`press min-h-11 rounded-full px-4 text-[14px] font-extrabold ${on ? "bg-brand text-ink" : "border border-line-strong bg-white text-ink"}`}
        >
          {on ? "Activado" : "Desactivado"}
        </button>
      </div>
      <p className="m-0 text-[13px] leading-snug text-muted">
        Un timbre suave suena solo mientras TechnoUltra está abierta y visible. Con la app cerrada, el sonido lo decide tu dispositivo (su tono de notificaciones); si está en silencio o en No molestar, no sonará.
      </p>
      {note ? <p className="m-0 text-[13px] font-bold text-ink" role="status">{note}</p> : null}
    </section>
  );
}
