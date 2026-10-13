"use client";

import { useEffect, useState } from "react";
import { IconXCircle } from "@/components/ui/icons";
import { recentlyDismissed } from "@/lib/pwa/install";
import { useInstall } from "./useInstall";

const KEY = "tu-push-dismissed";
const subscribedKey = (endpoint: string) => `tu-push-sync:${endpoint.slice(-24)}`;

/** Conversión de la clave pública VAPID (base64url) al formato que pide el navegador. */
function toKey(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const supported = (publicKey: string | null) => Boolean(publicKey) && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Suscribe este dispositivo (o reutiliza la suscripción) y la registra en el servidor con la sesión actual (upsert idempotente). */
async function subscribeAndRegister(publicKey: string): Promise<boolean> {
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
  const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  if (res.ok) {
    try {
      sessionStorage.setItem(subscribedKey(sub.endpoint), "1");
    } catch {
      /* sin almacenamiento de sesión: se repetirá la sincronización, que es inocua */
    }
  }
  return res.ok;
}

/**
 * Notificaciones del dispositivo, SIN depender de la campanita:
 *  1) Si ya hay permiso y el usuario los tiene activados, repara en silencio la suscripción (el navegador la pudo renovar o el servidor perderla).
 *  2) Si aún no decidió, ofrece «Activar notificaciones»: el permiso del sistema solo se pide al pulsar el botón (un gesto del usuario), nunca al cargar.
 *  3) Si lo bloqueó, no insiste (la pantalla de Notificaciones explica cómo permitirlos). En iPhone/iPad sin instalar no hay push: primero se instala.
 * El sonido y la vibración los decide el teléfono; aquí no se silencia nada.
 */
export function PushPrompt({ publicKey, pushEnabled }: { publicKey: string | null; pushEnabled: boolean }) {
  const { mode } = useInstall();
  const [ask, setAsk] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!supported(publicKey)) return;
    let alive = true;
    (async () => {
      const perm = Notification.permission;
      if (perm === "granted" && pushEnabled) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          // Con suscripción vigente y ya sincronizada en esta sesión no hay nada que hacer.
          let synced = false;
          try {
            synced = Boolean(sub && sessionStorage.getItem(subscribedKey(sub.endpoint)));
          } catch {
            synced = false;
          }
          if (!synced) await subscribeAndRegister(publicKey as string);
        } catch {
          /* sin red o sin service worker: se reintenta en la próxima apertura */
        }
        return;
      }
      if (perm !== "default") return; // bloqueado: no se insiste
      let stamp: number | null = null;
      try {
        stamp = Number(localStorage.getItem(KEY)) || null;
      } catch {
        stamp = null;
      }
      if (recentlyDismissed(stamp, Date.now()) && alive) return;
      if (alive) setTimeout(() => alive && setAsk(true), 8000);
    })();
    return () => {
      alive = false;
    };
  }, [publicKey, pushEnabled]);

  // Para no apilar dos avisos: si todavía se está ofreciendo instalar (Android/iPhone), el de notificaciones espera. En iPhone sin instalar no existe push.
  const installPending = mode === "prompt" || mode === "ios-safari" || mode === "ios-other";
  if (!ask || installPending) return note ? <Toast text={note} /> : null;

  async function enable() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setAsk(false);
        setNote(perm === "denied" ? "No activaste las notificaciones. Puedes permitirlas en la configuración del navegador." : "");
        return;
      }
      const ok = await subscribeAndRegister(publicKey as string);
      setAsk(false);
      setNote(ok ? "Notificaciones activadas en este dispositivo." : "No pudimos activar las notificaciones. Inténtalo desde «Notificaciones».");
    } catch {
      setAsk(false);
      setNote("No pudimos activar las notificaciones. Inténtalo desde «Notificaciones».");
    }
  }
  function dismiss() {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* sin almacenamiento: solo se oculta ahora */
    }
    setAsk(false);
  }

  return (
    <aside aria-label="Activar notificaciones del dispositivo" className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[460px] flex-col gap-2 rounded-card border border-line bg-white p-3.5 shadow-pop lg:bottom-4 lg:left-auto lg:right-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14.5px] font-extrabold leading-tight">Activar notificaciones del dispositivo</span>
          <span className="text-[12.5px] leading-snug text-ink-2">Te avisamos en tu teléfono cuando algo requiera tu atención, como firmar un acta, aunque no tengas la app abierta. Sin montos ni datos personales.</span>
        </div>
        <button type="button" onClick={dismiss} aria-label="Ahora no" className="flex h-11 w-11 flex-none items-center justify-center text-muted">
          <IconXCircle width={20} height={20} />
        </button>
      </div>
      <button type="button" onClick={() => void enable()} className="press min-h-11 rounded-[12px] bg-brand px-4 text-[14px] font-extrabold text-ink">
        Activar notificaciones
      </button>
    </aside>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <aside role="status" className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[460px] rounded-card border border-line bg-white p-3.5 text-[14px] font-bold shadow-pop lg:bottom-4 lg:left-auto lg:right-4">
      {text}
    </aside>
  );
}
