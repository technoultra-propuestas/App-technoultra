import Image from "next/image";
import { Wordmark } from "@/components/brand/Wordmark";
import type { ReactNode } from "react";

const TOTAL = 6;

/** Ilustraciones por PASO del flujo (índice = onboarding_step: bienvenida, celular, dirección, equipo, notificaciones, documentos). */
const ART = [
  { src: "/onboarding/onboarding-1.png", w: 1289, h: 1220 },
  { src: "/onboarding/onboarding-3.png", w: 1198, h: 1313 },
  { src: "/onboarding/onboarding-4.png", w: 1535, h: 1025 },
  { src: "/onboarding/onboarding-2.png", w: 1567, h: 1004 },
  { src: "/onboarding/onboarding-5.png", w: 1432, h: 1098 },
  { src: "/onboarding/onboarding-6.png", w: 1535, h: 1025 },
] as const;

/** Ilustración decorativa del paso (sin texto alternativo: no aporta información). Next la sirve optimizada (WebP/AVIF) y en carga diferida. */
export function StepArt({ step, className = "" }: { step: number; className?: string }) {
  const a = ART[Math.max(0, Math.min(5, step))];
  return (
    <div aria-hidden className={`relative mx-auto flex w-full justify-center ${className}`}>
      <span className={`absolute inset-x-[6%] top-[22%] bottom-0 rounded-[50%] bg-brand/10 blur-2xl lg:inset-x-0 lg:top-[8%] lg:bg-brand/20 lg:blur-3xl ${step === 0 ? "hidden lg:block" : ""}`} />
      <Image
        src={a.src}
        alt=""
        width={a.w}
        height={a.h}
        sizes="(min-width:1024px) 480px, 360px"
        className={`relative h-auto w-auto max-w-full object-contain ${step === 0 ? "max-h-[300px] md:max-h-[380px]" : "max-h-[200px] md:max-h-[260px]"} lg:max-h-[min(56vh,520px)]`}
      />
    </div>
  );
}

/**
 * Contenedor del onboarding. Móvil/tableta: una columna con la ilustración del paso entre los campos y los botones. Escritorio: contenido a
 * la izquierda e ilustración grande a la derecha. Solo presentación: los pasos, datos y navegación los gobierna page.tsx / actions.ts.
 */
export function OnboardingShell({
  step,
  title,
  subtitle,
  skip,
  children,
}: {
  step: number;
  title: ReactNode;
  subtitle?: string;
  /** Acción «Omitir» (solo en pasos que realmente se pueden omitir). */
  skip?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      id="contenido"
      tabIndex={-1}
      className="pt-safe pb-safe relative isolate flex min-h-screen-dvh flex-col overflow-clip bg-[radial-gradient(70%_40%_at_100%_100%,rgba(255,138,0,.10),transparent_70%)] md:items-center md:justify-center lg:bg-[#FBF7F2]"
    >
      {/* Escritorio: formas suaves de color detrás de la tarjeta (decorativas). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden lg:block">
        <span className="absolute -left-[10%] -top-[18%] h-[70vh] w-[55vw] rounded-[50%] bg-brand/15 blur-[90px]" />
        <span className="absolute -bottom-[25%] -right-[8%] h-[75vh] w-[50vw] rounded-[50%] bg-brand/20 blur-[100px]" />
      </div>
      {/* La safe-area va en <main> (su clase pisa el padding): el espaciado va en este contenedor interior. */}
      <div className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col px-5 py-5 pb-8 md:px-10 md:py-10 lg:max-w-[1240px] lg:flex-none lg:px-8 lg:py-6 2xl:max-w-[1380px]">
        <div className="mx-auto grid w-full max-w-[520px] flex-1 gap-6 md:max-w-[640px] md:flex-none lg:max-w-none lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] lg:items-center lg:gap-10 lg:rounded-[32px] lg:bg-[linear-gradient(115deg,#fff_0%,#fff_52%,#FFF1E2_100%)] lg:p-10 lg:shadow-[0_40px_120px_-50px_rgba(180,80,0,.45)] lg:ring-1 lg:ring-black/5 xl:gap-16 xl:p-12 2xl:p-14">
          <section className="tu-stagger flex min-h-0 min-w-0 flex-col gap-[18px] md:gap-6 lg:max-w-[600px]">
            <Progress step={step} skip={skip} />
            <div className={`items-center gap-3 lg:order-first lg:flex ${step === 0 ? "flex" : "hidden"}`}>
              <Image src="/login/logo-circulo.webp" alt="" width={72} height={72} priority className="h-[68px] w-[68px] lg:h-[56px] lg:w-[56px]" />
              <Wordmark size={26} />
            </div>
            <div className="flex flex-col gap-2 md:gap-3">
              <h1 className="m-0 whitespace-pre-line text-[30px] leading-[1.1] font-extrabold tracking-[-0.025em] md:text-[40px] xl:text-[46px]">{title}</h1>
              <div className="h-1 w-10 rounded-sm bg-brand md:w-14" />
              {subtitle ? <p className="m-0 mt-1 text-base leading-normal text-muted md:text-[18px]">{subtitle}</p> : null}
            </div>
            {children}
          </section>
          <aside aria-hidden className="hidden lg:block">
            <div className="tu-art-in">
              <div className="animate-[tu-float_6s_ease-in-out_infinite]">
                <StepArt step={step} />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Progress({ step, skip }: { step: number; skip?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-[12px] font-bold tracking-[0.06em] text-muted" aria-live="polite">
          PASO {step + 1} DE {TOTAL}
        </p>
        {skip}
      </div>
      <div aria-hidden className="flex gap-1.5">
        {Array.from({ length: TOTAL }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 origin-left rounded-full ${i <= step ? "bg-brand" : "bg-line"} ${i === step ? "lg:animate-[tu-fill_.7s_ease-out_both]" : ""}`} />
        ))}
      </div>
    </div>
  );
}
