import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode, SVGProps } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { GoogleButton, RegisterForm } from "../forms";
import { GazeStage } from "./gaze";

export const metadata: Metadata = { title: "Crea tu cuenta", robots: { index: false } };

const ico = { "aria-hidden": true, viewBox: "0 0 24 24", width: 26, height: 26, fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Laptop = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico} {...p}>
    <rect x="4" y="5" width="16" height="11" rx="2" />
    <path d="M2 19h20" />
  </svg>
);
const Doc = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico} {...p}>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5M10 13h6M10 17h6" />
  </svg>
);
const Shield = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico} {...p}>
    <path d="M12 3 5 6v5.5c0 4.4 2.9 7.5 7 9.5 4.1-2 7-5.1 7-9.5V6l-7-3z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
);
const Bell = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico} {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z" />
    <path d="M10 21h4" />
  </svg>
);
const Bolt = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico} {...p}>
    <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3z" />
  </svg>
);
const Devices = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico} {...p}>
    <rect x="3" y="5" width="13" height="9" rx="1.5" />
    <rect x="14" y="9" width="7" height="11" rx="1.5" />
    <path d="M6 18h6" />
  </svg>
);
const Headset = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico} {...p}>
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <rect x="3" y="14" width="4" height="6" rx="1.5" />
    <rect x="17" y="14" width="4" height="6" rx="1.5" />
    <path d="M19 20c0 1.2-1.5 2-4 2" />
  </svg>
);

const PILLS: { icon: ReactNode; title: string; text: string; shift: string }[] = [
  { icon: <Laptop />, title: "Tus equipos", text: "Siempre a la mano", shift: "lg:ml-0" },
  { icon: <Doc />, title: "Cotizaciones", text: "Rápidas y sin complicaciones", shift: "lg:ml-3" },
  { icon: <Shield />, title: "Tus garantías", text: "Organizadas y seguras", shift: "lg:ml-8" },
  { icon: <Bell />, title: "Notificaciones", text: "Entérate de todo", shift: "lg:ml-3" },
];
const BENEFITS: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <Bolt />, title: "Rápido", text: "Crea tu cuenta en menos de 1 minuto" },
  { icon: <Shield />, title: "Seguro", text: "Tu información siempre protegida" },
  { icon: <Devices />, title: "En todos tus dispositivos", text: "Accede desde donde quieras" },
  { icon: <Headset />, title: "Soporte", text: "Siempre contigo" },
];

/**
 * «Crea tu cuenta». Móvil/tableta: exactamente la pantalla de siempre (mismas clases que AuthShell). Escritorio (≥1024 px): escena con la
 * ilustración que sigue el cursor, tarjeta del formulario a la izquierda y beneficios; es el MISMO formulario (una sola instancia).
 */
export default function RegisterPage() {
  return (
    <main id="contenido" tabIndex={-1} className="pt-safe pb-safe min-h-screen-dvh lg:relative lg:isolate lg:min-h-screen lg:overflow-clip lg:bg-[#FDF1E4]">
      {/* ---- Escena (solo escritorio) ---- */}
      <div className="hidden lg:block">
        <div className="absolute inset-0 -z-10">
          <GazeStage />
        </div>
        <header className="absolute inset-x-0 top-0 z-10 flex items-start justify-between px-[4.5vw] pt-7 text-ink">
          <div className="flex items-center gap-3">
            <Image src="/login/logo-circulo.webp" alt="" width={72} height={72} priority className="h-[68px] w-[68px]" />
            <div className="flex flex-col gap-1">
              <Wordmark size={28} />
              <span className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-muted">Tu mundo tecnológico en un solo lugar</span>
            </div>
          </div>
          <p className="m-0 pt-2 text-[15px] font-semibold text-ink-2">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-extrabold text-brand-text underline decoration-brand underline-offset-[3px]">
              Inicia sesión
            </Link>
          </p>
        </header>
        <ul className="tu-stagger absolute right-[3.2vw] top-[22vh] z-10 m-0 flex w-[min(21vw,310px)] list-none flex-col gap-3.5 p-0">
          {PILLS.map((p, i) => (
            <li key={p.title} className={p.shift}>
              <div className="flex items-center gap-3.5 rounded-full bg-white/80 py-3 pl-3.5 pr-6 shadow-[0_14px_40px_-18px_rgba(160,70,0,.5)] ring-1 ring-white/70 backdrop-blur-md motion-safe:animate-[tu-float_6s_ease-in-out_infinite]" style={{ animationDelay: `${-i * 1.4}s` }}>
                <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-brand text-white shadow-[0_8px_18px_-10px_rgba(255,138,0,.9)]">{p.icon}</span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <strong className="text-[16px] font-extrabold text-ink">{p.title}</strong>
                  <span className="text-[12.5px] font-semibold text-muted">{p.text}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
        <ul className="absolute inset-x-[3.5vw] bottom-5 z-10 m-0 hidden list-none grid-cols-4 gap-2 rounded-[28px] bg-white/75 px-5 py-4 shadow-[0_18px_50px_-24px_rgba(160,70,0,.45)] ring-1 ring-white/70 backdrop-blur-md lg:grid">
          {BENEFITS.map((b) => (
            <li key={b.title} className="flex items-center gap-3 px-3 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-black/10">
              <span className="flex-none text-brand">{b.icon}</span>
              <span className="flex min-w-0 flex-col leading-tight">
                <strong className="text-[14px] font-extrabold text-ink">{b.title}</strong>
                <span className="text-[12px] font-semibold text-muted">{b.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ---- Contenido: en móvil idéntico a AuthShell; en escritorio, la tarjeta ---- */}
      <div className="mx-auto flex max-w-[480px] flex-col gap-[18px] px-5 py-5 pb-10 lg:absolute lg:left-[7.5vw] lg:top-1/2 lg:z-10 lg:mx-0 lg:max-h-[88vh] lg:w-[min(460px,32vw)] lg:min-w-[400px] lg:max-w-none lg:-translate-y-[49%] lg:gap-4 lg:overflow-y-auto lg:rounded-[28px] lg:bg-white lg:px-8 lg:py-8 [@media(max-height:940px)]:lg:gap-2.5 [@media(max-height:940px)]:lg:py-5 lg:shadow-[0_40px_100px_-40px_rgba(140,60,0,.5)] lg:ring-1 lg:ring-black/5">
        <Link
          href="/"
          aria-label="Volver"
          className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-line bg-white lg:hidden"
        >
          <svg aria-hidden viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em] lg:text-[40px] [@media(max-height:940px)]:lg:text-[34px]">
            Crea tu <span className="lg:text-brand">cuenta</span>
          </h1>
          <div className="h-1 w-10 rounded-sm bg-brand" />
          <p className="m-0 mt-1 text-base leading-normal text-muted">Con tu cuenta ves tus equipos, cotizaciones y garantías en un solo lugar.</p>
        </div>
        <GoogleButton />
        <div className="flex items-center gap-3 text-[13px] font-bold text-muted" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          <span className="lg:hidden">o con tu correo</span>
          <span className="hidden lg:inline">o regístrate con tu correo</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <RegisterForm />
        <p className="m-0 text-center text-[15px] font-semibold text-muted lg:hidden">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-extrabold text-ink underline decoration-brand underline-offset-[3px]">
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
