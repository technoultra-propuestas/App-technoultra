"use client";

import { useEffect } from "react";

/**
 * Sonido de marca DENTRO de la app abierta (opt-in). Honestidad técnica: la API de notificaciones web NO permite elegir el sonido de una
 * notificación del sistema: con la app cerrada o en segundo plano suena el tono que el dispositivo tenga asignado (o ninguno si está en
 * silencio / No molestar; eso no se puede ni se intenta saltar). Este timbre corto solo suena mientras la pestaña o app instalada está
 * visible, si la persona lo activó y si el navegador ya permitió audio tras un toque suyo.
 */
export const SOUND_KEY = "tu-sound";

export const soundEnabled = () => {
  try {
    return localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
};

export const setSoundEnabled = (on: boolean) => {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* sin almacenamiento: queda desactivado */
  }
  window.dispatchEvent(new Event(SOUND_EVENT));
};

const SOUND_EVENT = "tu-sound-change";
/** Suscripción al ajuste (para `useSyncExternalStore`): cambios en esta pestaña o en otra. */
export const subscribeSound = (cb: () => void) => {
  window.addEventListener(SOUND_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SOUND_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

let ctx: AudioContext | null = null;
const audio = () => {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
};

/** Timbre breve y suave (dos notas, ~0,5 s, volumen bajo). Devuelve false si el navegador no deja reproducir audio todavía. */
export async function playChime(): Promise<boolean> {
  const c = audio();
  if (!c) return false;
  try {
    if (c.state === "suspended") await c.resume();
    if (c.state !== "running") return false;
    const t0 = c.currentTime;
    [
      [659.25, 0],
      [880, 0.16],
    ].forEach(([freq, at]) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.32);
      o.connect(g).connect(c.destination);
      o.start(t0 + at);
      o.stop(t0 + at + 0.34);
    });
    return true;
  } catch {
    return false;
  }
}

/** Escucha los avisos push que el service worker reenvía a la ventana abierta y, si está activado, suena el timbre una vez por aviso. */
export function NotificationSound() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // El navegador solo habilita audio tras un gesto: se «desbloquea» con el primer toque (sin reproducir nada).
    const unlock = () => {
      if (soundEnabled()) void audio()?.resume().catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    const seen = new Set<string>();
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; tag?: string } | null;
      if (d?.type !== "PUSH_RECEIVED" || document.visibilityState !== "visible" || !soundEnabled()) return;
      if (d.tag) {
        if (seen.has(d.tag)) return; // un mismo aviso no suena dos veces
        seen.add(d.tag);
      }
      void playChime();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
