"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProductImage } from "@/components/store/ProductImage";
import { copFormat } from "@/lib/catalog/normalize";
import { COMPATIBILITY_NOTE } from "@/lib/ai/product-hints";
import { previewDiagnosisAction, type AiPreviewState } from "../ai-actions";

const URGENCY = { low: "Baja", medium: "Media", high: "Alta" } as const;
const MIN_CHARS = 30; // antes de eso no hay suficiente información para analizar
const IDLE_MS = 2200; // se analiza cuando la persona termina de escribir (no en cada tecla)
const MAX_AUTO_RUNS = 4; // tope por visita: cada análisis consume IA

/**
 * Resumen contextual del diagnóstico preliminar. Aparece SOLO, cuando la persona termina de describir los síntomas (sin botón principal):
 * «Según los síntomas que nos indicaste…» → causa principal, otras causas, urgencia, recomendación y, si hay relación sustentada, productos
 * del Shop. Siempre con el aviso obligatorio. Si la IA falla, el servidor responde con reglas básicas; si todo falla, no se muestra nada raro.
 */
export function AiPreview({ serviceId, equipmentId, problem }: { serviceId: string; equipmentId: string; problem: string }) {
  const [state, setState] = useState<AiPreviewState | null>(null);
  const [analyzed, setAnalyzed] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const runs = useRef(0);
  const inflight = useRef(0);
  const text = problem.trim();

  const run = useCallback(
    async (t: string) => {
      const id = ++inflight.current;
      setBusy(true);
      setFailed(false);
      runs.current += 1;
      try {
        const fd = new FormData();
        fd.set("serviceId", serviceId);
        fd.set("equipmentId", equipmentId);
        fd.set("problem", t);
        const res = await previewDiagnosisAction({ ok: false }, fd);
        if (id !== inflight.current) return; // llegó una respuesta más nueva
        if (res.ok && res.result) {
          setState(res);
          setAnalyzed(t);
        } else {
          setFailed(true);
        }
      } catch {
        if (id === inflight.current) setFailed(true);
      } finally {
        if (id === inflight.current) setBusy(false);
      }
    },
    [serviceId, equipmentId],
  );

  useEffect(() => {
    if (text.length < MIN_CHARS || text === analyzed || runs.current >= MAX_AUTO_RUNS) return;
    const timer = setTimeout(() => void run(text), IDLE_MS);
    return () => clearTimeout(timer);
  }, [text, analyzed, run]);

  if (text.length < MIN_CHARS && !state) {
    return <p className="m-0 text-[13px] text-muted">Cuéntanos con detalle qué pasa y te mostraremos un análisis preliminar mientras terminas de escribir.</p>;
  }

  const stale = state && analyzed !== text;
  const r = state?.result;
  const causes = r ? [...r.causes].sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.likelihood] - ({ high: 0, medium: 1, low: 2 })[b.likelihood]) : [];
  const [main, ...others] = causes;

  return (
    <section aria-live="polite" aria-label="Análisis preliminar" className="flex flex-col gap-3">
      {busy ? (
        <div role="status" className="flex items-center gap-3 rounded-card border border-line bg-white p-4 text-[14px] font-bold text-ink-2">
          <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
          Analizando lo que nos contaste…
        </div>
      ) : null}
      {failed && !busy ? (
        <div className="flex flex-col gap-2 rounded-[14px] bg-warn-soft p-3.5 text-[14px] font-semibold text-warn">
          <span>Por ahora no pudimos generar el análisis. Puedes enviar tu solicitud igual: el técnico revisará todo.</span>
          <button type="button" onClick={() => void run(text)} className="press min-h-11 w-fit rounded-[12px] border border-warn/30 bg-white px-4 text-[14px] font-extrabold text-ink">Intentar de nuevo</button>
        </div>
      ) : null}
      {r && !busy ? (
        <div className={`flex flex-col gap-3 rounded-card border border-line bg-white p-4 shadow-card ${stale ? "opacity-70" : ""}`}>
          {stale ? <p className="m-0 text-[12.5px] font-bold text-muted">Cambiaste la descripción: actualizamos el análisis en un momento.</p> : null}
          <p className="m-0 text-[15px] font-bold leading-snug">Según los síntomas que nos indicaste, hemos detectado que lo que podría estar afectando a tu equipo es:</p>
          {main ? (
            <div className="rounded-[14px] bg-paper p-3.5">
              <div className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-muted">Posible causa principal</div>
              <div className="text-[16px] font-extrabold leading-snug">{main.text}</div>
            </div>
          ) : null}
          {others.length > 0 ? (
            <div>
              <div className="mb-1 text-[12px] font-extrabold uppercase tracking-[0.04em] text-muted">Otras causas posibles</div>
              <ul className="m-0 list-disc pl-5 text-[14.5px]">
                {others.map((c, i) => (
                  <li key={i}>{c.text}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-bold">
            <span className="text-muted">Urgencia estimada:</span>
            <span className={`rounded-full px-3 py-1 ${r.urgency === "high" ? "bg-danger-soft text-danger" : r.urgency === "medium" ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>{URGENCY[r.urgency]}</span>
          </div>
          <div>
            <div className="mb-1 text-[12px] font-extrabold uppercase tracking-[0.04em] text-muted">Recomendación</div>
            <p className="m-0 text-[14.5px] leading-normal">{r.summary}</p>
            {r.recommendations.length > 0 ? (
              <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0 text-[14.5px]">
                {r.recommendations.map((x, i) => (
                  <li key={i}>
                    <span className="font-extrabold">{x.name}</span> — {x.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {r.products.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <div className="text-[14px] font-extrabold">Productos que podrían ayudarte</div>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {r.products.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <ProductImage src={p.image_url} alt={p.name} width={160} className="h-14 w-14 flex-none rounded-[10px] border border-line" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="line-clamp-2 text-[13.5px] font-extrabold leading-snug">{p.name}</span>
                      <span className="text-[13px] font-bold text-muted">{copFormat(p.price)}</span>
                    </div>
                    <Link href={`/tienda/producto/${p.slug}`} target="_blank" className="press flex min-h-11 flex-none items-center rounded-[12px] border border-line-strong px-3 text-[13px] font-extrabold text-ink no-underline">Ver producto</Link>
                  </li>
                ))}
              </ul>
              <p className="m-0 text-[12.5px] text-muted">{r.products[0].reason} {COMPATIBILITY_NOTE}</p>
            </div>
          ) : null}
          <div className="rounded-[12px] bg-[#FFF0DD] px-3 py-2 text-[13px] font-bold text-[#7A3E00]">{state?.disclaimer}</div>
          {/* Solo se adjunta a la solicitud el análisis que corresponde al texto actual (no uno desactualizado). */}
          {!stale && state?.aiId ? <input type="hidden" name="aiId" value={state.aiId} /> : null}
        </div>
      ) : null}
    </section>
  );
}
