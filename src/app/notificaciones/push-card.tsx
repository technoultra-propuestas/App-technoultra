"use client";

import { useEffect, useState } from "react";

type Phase = "checking" | "unsupported" | "ios-install" | "off" | "denied" | "on" | "busy";

/** Conversión de la clave pública VAPID (base64url) al formato que pide el navegador. */
function toKey(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Activación DISCRETA de las notificaciones del dispositivo: el permiso del navegador solo se pide cuando la persona pulsa el botón (nunca al
 * cargar la página). Si el navegador no lo admite o el permiso está bloqueado, se explica con claridad y la app sigue funcionando igual:
 * las notificaciones siempre quedan en esta pantalla.
 */
export function PushCard({ publicKey }: { publicKey: string | null }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // En iPhone/iPad el push web solo existe con la app instalada en la pantalla de inicio (iOS 16.4+).
        if (alive) setPhase(ios && !standalone && publicKey ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (alive) setPhase("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        if (alive) setPhase(sub && Notification.permission === "granted" ? "on" : "off");
      } catch {
        if (alive) setPhase("off");
      }
    })();
    return () => {
      alive = false;
    };
  }, [publicKey]);

  async function enable() {
    if (!publicKey) return;
    setPhase("busy");
    setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPhase(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      // Un service worker anterior no sabe recibir push: se activa el nuevo antes de suscribir.
      await reg.update().catch(() => undefined);
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        await new Promise((r) => setTimeout(r, 800));
      }
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error("server");
      setPhase("on");
    } catch {
      setPhase("off");
      setMsg("No pudimos activar las notificaciones en este dispositivo. Inténtalo de nuevo en un momento.");
    }
  }

  async function disable() {
    setPhase("busy");
    setMsg("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setPhase("off");
    } catch {
      setPhase("on");
      setMsg("No pudimos desactivarlos. Inténtalo de nuevo.");
    }
  }

  if (phase === "checking") return null;
  return (
    <section aria-label="Notificaciones en este dispositivo" className="flex flex-col gap-2 rounded-card border border-line bg-white p-4 shadow-card">
      <h2 className="m-0 text-[16px] font-extrabold">Notificaciones en este dispositivo</h2>
      {phase === "unsupported" ? (
        <p className="m-0 text-[14px] leading-snug text-muted">Este navegador no permite notificaciones del sistema (o aún no están habilitadas). Tus notificaciones siempre aparecen aquí y, si lo permites, también en tu correo. En iPhone, instala primero TechnoUltra en tu pantalla de inicio.</p>
      ) : null}
      {phase === "ios-install" ? (
        <p className="m-0 text-[14px] leading-snug text-muted">En iPhone y iPad las notificaciones del dispositivo funcionan solo con TechnoUltra instalada: en Safari toca <strong>Compartir → Añadir a pantalla de inicio</strong>, ábrela desde allí y vuelve a esta pantalla. Mientras tanto, tus notificaciones siempre aparecen aquí.</p>
      ) : null}
      {phase === "denied" ? (
        <p className="m-0 text-[14px] leading-snug text-muted">Bloqueaste las notificaciones para este sitio. Si quieres recibirlas, permítelas en la configuración del navegador (candado junto a la dirección). Mientras tanto, las verás aquí.</p>
      ) : null}
      {phase === "off" || phase === "busy" ? (
        <>
          <p className="m-0 text-[14px] leading-snug text-muted">Te avisaremos en este dispositivo de lo importante: pagos confirmados, diagnóstico listo, cotizaciones, equipo listo y acciones pendientes. No incluye montos ni datos personales, y puedes desactivarlo cuando quieras. Primero tu navegador te pedirá permiso.</p>
          <button type="button" onClick={enable} disabled={phase === "busy"} className="press min-h-12 w-full rounded-2xl bg-brand px-5 text-[15px] font-extrabold text-ink disabled:opacity-60">
            {phase === "busy" ? "Activando…" : "Activar notificaciones en este dispositivo"}
          </button>
        </>
      ) : null}
      {phase === "on" ? (
        <>
          <p className="m-0 text-[14px] font-semibold leading-snug text-ok">✓ Las notificaciones están activadas en este dispositivo.</p>
          <button type="button" onClick={disable} className="press min-h-11 w-fit text-[14px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">
            Desactivar en este dispositivo
          </button>
        </>
      ) : null}
      {msg ? <p role="alert" className="m-0 text-[13px] font-semibold text-danger">{msg}</p> : null}
    </section>
  );
}
