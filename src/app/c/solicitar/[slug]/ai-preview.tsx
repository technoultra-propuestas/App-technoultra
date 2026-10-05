"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/form";
import { previewDiagnosisAction, type AiPreviewState } from "../ai-actions";

const URGENCY = { low: "Baja", medium: "Media", high: "Alta" } as const;
const LIKELIHOOD = { high: "más probable", medium: "posible", low: "menos probable" } as const;

/**
Vive dentro del formulario de la solicitud y usa formAction para no enviarla: solo pide la vista previa.
 */
export function AiPreview() {
  const [state, action, pending] = useActionState<AiPreviewState, FormData>(previewDiagnosisAction, { ok: false });
  return (
    <div className="flex flex-col gap-3">
      <button
        type="submit"
        formAction={action}
        formNoValidate
        disabled={pending}
        className="min-h-12 rounded-2xl border-[1.5px] border-line-strong bg-white text-[15px] font-extrabold disabled:opacity-60"
      >
        {pending ? "Analizando…" : "Ver diagnóstico preliminar con IA"}
      </button>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.result ? (
        <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-white p-4" aria-live="polite">
          <div className="rounded-[12px] bg-[#FFF0DD] px-3 py-2 text-[13px] font-bold text-[#7A3E00]">{state.disclaimer}</div>
          <p className="m-0 text-[15px] leading-normal">{state.result.summary}</p>
          {state.result.causes.length > 0 ? (
            <div>
              <div className="mb-1 text-[13px] font-extrabold text-muted">POSIBLES CAUSAS (por confirmar)</div>
              <ul className="m-0 list-disc pl-5 text-[15px]">
                {state.result.causes.map((c, i) => (
                  <li key={i}>
                    {c.text} <span className="text-[12px] text-muted">({LIKELIHOOD[c.likelihood]})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {state.result.recommendations.length > 0 ? (
            <div>
              <div className="mb-1 text-[13px] font-extrabold text-muted">SERVICIOS QUE PODRÍAN AYUDAR</div>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[15px]">
                {state.result.recommendations.map((r, i) => (
                  <li key={i}>
                    <span className="font-extrabold">{r.name}</span> — {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="text-[13px] text-muted">Urgencia estimada: {URGENCY[state.result.urgency]}</div>
          <input type="hidden" name="aiId" value={state.aiId} />
        </div>
      ) : null}
    </div>
  );
}
