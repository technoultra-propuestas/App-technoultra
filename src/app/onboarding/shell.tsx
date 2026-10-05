import type { ReactNode } from "react";

const TOTAL = 6;

/**
 * Contenedor del onboarding. Móvil: una columna cómoda. Tablet: columna más ancha y tipografía mayor. Escritorio: dos zonas
 * (contenido a la izquierda, composición del proceso a la derecha) en un contenedor de hasta ~1180 px. Solo presentación:
 * los pasos, datos y navegación los gobierna page.tsx / actions.ts.
 */
export function OnboardingShell({ step, title, subtitle, children }: { step: number; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main id="contenido" tabIndex={-1} className="pt-safe pb-safe min-h-screen-dvh md:flex md:items-center">
      {/* La safe-area va en <main> (su clase pisa el padding): el espaciado va en este contenedor interior. */}
      <div className="mx-auto w-full max-w-[1180px] px-5 py-5 pb-10 md:px-10 md:py-10 lg:px-12 lg:py-12">
        <div className="mx-auto grid w-full max-w-[560px] gap-6 md:max-w-[680px] lg:max-w-none lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-center lg:gap-14 xl:grid-cols-[minmax(0,1fr)_minmax(380px,480px)] xl:gap-20">
          <section className="flex min-w-0 flex-col gap-[18px] md:gap-6 lg:max-w-[600px]">
            <Progress step={step} />
            <div className="flex flex-col gap-2 md:gap-3">
              <h1 className="m-0 text-[30px] leading-[1.1] font-extrabold tracking-[-0.025em] md:text-[40px] xl:text-[48px]">{title}</h1>
              <div className="h-1 w-10 rounded-sm bg-brand md:w-14" />
              {subtitle ? <p className="m-0 mt-1 text-base leading-normal text-muted md:text-[18px]">{subtitle}</p> : null}
            </div>
            {children}
          </section>
          <aside aria-hidden className="hidden lg:block">
            <ProcessVisual />
          </aside>
        </div>
      </div>
    </main>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[13px] font-bold tracking-[0.04em] text-muted" aria-live="polite">
        PASO {step + 1} DE {TOTAL}
      </p>
      <div aria-hidden className="flex gap-1.5">
        {Array.from({ length: TOTAL }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-line"}`} />
        ))}
      </div>
    </div>
  );
}

const STAGES: { label: string; hint: string; state: "done" | "active" | "todo" }[] = [
  { label: "Recepción del equipo", hint: "Con fotos y estado registrado", state: "done" },
  { label: "Diagnóstico", hint: "Preliminar con IA, validado por un técnico", state: "done" },
  { label: "Tu aprobación", hint: "No hacemos nada sin tu visto bueno", state: "active" },
  { label: "Reparación", hint: "Con avances en tiempo real", state: "todo" },
  { label: "Entrega con garantía", hint: "Y próximo mantenimiento programado", state: "todo" },
];

/** Composición ilustrativa (no son datos reales): cómo se ve el avance de un servicio en TechnoUltra. */
function ProcessVisual() {
  return (
    <div className="rounded-[28px] bg-ink p-7 text-white xl:p-8">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-bold tracking-[0.08em] text-[#C9C9C5]">EJEMPLO · TU SERVICIO</span>
        <span className="rounded-full bg-brand px-3 py-1 text-[12px] font-extrabold text-ink">En aprobación</span>
      </div>
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#262626] p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#121212]">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#FF8A00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="5" width="16" height="11" rx="2" />
            <path d="M2 19h20" />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-extrabold">Portátil · mantenimiento</div>
          <div className="text-[13px] text-[#C9C9C5]">Cotización lista para tu decisión</div>
        </div>
      </div>
      <ol className="m-0 mt-6 flex list-none flex-col p-0">
        {STAGES.map((s, i) => (
          <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0">
            {i < STAGES.length - 1 ? <span className={`absolute top-8 left-[13px] h-[calc(100%-2rem)] w-0.5 ${s.state === "done" ? "bg-brand" : "bg-[#3A3A3A]"}`} /> : null}
            <span
              className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${
                s.state === "done" ? "bg-brand text-ink" : s.state === "active" ? "bg-white text-ink ring-4 ring-[#FF8A00]/40 motion-safe:animate-pulse" : "border-2 border-[#3A3A3A] text-[#8A8A86]"
              }`}
            >
              {s.state === "done" ? (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <div className="min-w-0">
              <div className={`text-[15px] font-extrabold ${s.state === "todo" ? "text-[#8A8A86]" : "text-white"}`}>{s.label}</div>
              <div className={`text-[13px] ${s.state === "todo" ? "text-[#6E6E6A]" : "text-[#C9C9C5]"}`}>{s.hint}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
