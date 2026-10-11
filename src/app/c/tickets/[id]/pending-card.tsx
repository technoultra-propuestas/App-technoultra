"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { paymentSteps } from "@/lib/domain/service-stages";
import { PaymentTimeline } from "@/components/ui/service-flow";
import { PayStatusCard } from "./pay-status-card";

const SLOW_AFTER_MS = 5 * 60_000;

/** Intervalo del siguiente sondeo según cuánto lleva la pantalla abierta: rápido al principio, más espaciado después, y se detiene. */
function nextDelay(openMs: number): number | null {
  if (openMs < 2 * 60_000) return 5_000;
  if (openMs < 10 * 60_000) return 15_000;
  if (openMs < 30 * 60_000) return 30_000;
  return null; // luego queda el botón «Consultar estado de pago»
}

/**
 * Pago EN VALIDACIÓN. Pide al servidor (no al navegador) que compruebe el estado real con el proveedor: al abrir, cada pocos segundos
 * mientras la pantalla está visible y a demanda con el botón. Cuando la base de datos cambia de estado, recarga la tarjeta sola.
 * Nunca marca un pago como fallido ni aprobado por tiempo: si no se puede verificar, lo dice y deja reintentar.
 */
export function PendingCard({ ticketId, startedAt, concept, amount, children }: { ticketId: string; startedAt: string; concept: string; amount: string; children?: ReactNode }) {
  const router = useRouter();
  const [unverified, setUnverified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false); // se calcula en el efecto (la hora no es pura durante el render)
  const openedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/pagos/estado", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticketId }), cache: "no-store" });
      const out = (await res.json().catch(() => null)) as { ok?: boolean; state?: string; verified?: boolean } | null;
      if (!res.ok || !out?.ok) {
        setUnverified(true);
        return;
      }
      setUnverified(out.verified === false);
      if (out.state !== "validating") router.refresh(); // cambió de estado en la base de datos: mostrar el resultado real
    } catch {
      setUnverified(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [ticketId, router]);

  useEffect(() => {
    let alive = true;
    openedAt.current = Date.now();
    const loop = () => {
      if (!alive) return;
      const d = nextDelay(Date.now() - openedAt.current);
      if (d === null) return;
      timer.current = setTimeout(async () => {
        if (document.visibilityState === "visible") await check();
        loop();
      }, d);
    };
    const first = setTimeout(() => {
      void check();
      setSlow(Date.now() - new Date(startedAt).getTime() > SLOW_AFTER_MS);
    }, 0);
    loop();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const slowTimer = setInterval(() => setSlow(Date.now() - new Date(startedAt).getTime() > SLOW_AFTER_MS), 15_000);
    return () => {
      alive = false;
      clearTimeout(first);
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(slowTimer);
    };
  }, [check, startedAt]);

  return (
    <PayStatusCard
      variant={unverified ? "unknown" : "pending"}
      title={unverified ? "No pudimos verificar el estado de tu pago" : "Estamos confirmando tu pago"}
      text={unverified ? "Estamos comprobándolo para evitar cobros duplicados. Puedes consultar el estado nuevamente." : "Estamos esperando la confirmación de la plataforma de pago. Te avisaremos cuando tengamos una respuesta. No necesitas volver a pagar mientras verificamos."}
      concept={concept}
      amount={amount}
      timeline={<PaymentTimeline steps={paymentSteps("validating", { unverified })} />}
      notice={
        slow ? (
          <p role="status" className="m-0 rounded-[12px] bg-white/70 p-3 text-[13.5px] font-semibold leading-snug text-ink">
            La confirmación está tardando más de lo habitual. Estamos comprobando el estado con la plataforma de pago. No realices otro pago mientras verificamos.
          </p>
        ) : null
      }
    >
      <button type="button" onClick={() => void check()} disabled={busy} className="press min-h-12 w-full rounded-2xl border-[1.5px] border-line-strong bg-white px-5 text-[15px] font-extrabold text-ink disabled:opacity-60">
        {busy ? "Consultando…" : "Consultar estado de pago"}
      </button>
      {children}
    </PayStatusCard>
  );
}
