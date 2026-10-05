"use client";

import { useEffect, useState } from "react";

/** Registra el service worker (solo en producción) y ofrece una actualización controlada cuando hay versión nueva. */
export function PwaRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let reloading = false;
    const onController = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
          });
        });
      })
      .catch(() => {
        /* sin service worker la app sigue funcionando normalmente */
      });
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onController);
  }, []);

  if (!waiting) return null;
  return (
    <div role="status" className="pb-safe fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <div className="mb-16 flex w-full max-w-[480px] items-center justify-between gap-3 rounded-[16px] bg-ink px-4 py-3 text-white shadow-lg md:mb-0">
        <span className="text-[14px] font-bold">Hay una versión nueva de TechnoUltra.</span>
        <button type="button" onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })} className="min-h-10 rounded-[12px] bg-brand px-4 text-[14px] font-extrabold text-ink">
          Actualizar
        </button>
      </div>
    </div>
  );
}
