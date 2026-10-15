import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode, SVGProps } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { safeNext } from "@/lib/auth/routes";
import { GoogleButton } from "../forms";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Inicia sesión", robots: { index: false } };

const NOTICES: Record<string, string> = {
  inactive: "Esta cuenta está desactivada. Habla con administración.",
  oauth: "No pudimos iniciar sesión con Google. Inténtalo de nuevo.",
  cancelled: "Cancelaste el inicio de sesión con Google. Puedes intentarlo de nuevo cuando quieras.",
  profile: "No pudimos cargar tu perfil. Inténtalo de nuevo o escríbenos si el problema continúa.",
  link: "Ese enlace ya se usó, venció o se abrió en otro dispositivo. Si ya confirmaste tu correo, inicia sesión; si no, pide un correo nuevo desde Crear cuenta.",
  staff: "Las cuentas del equipo entran solo con correo y contraseña, no con Google.",
  rate: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
};

const s = { "aria-hidden": true, viewBox: "0 0 24 24", width: 26, height: 26, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Wrench = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s} {...p}>
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3.5 17.2a1.8 1.8 0 0 0 2.6 2.6l5.8-5.8a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />
  </svg>
);
const Code = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s} {...p}>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
  </svg>
);
const Cart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s} {...p}>
    <path d="M3 4h2.5l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8a1.5 1.5 0 0 0 1.5-1.1L20 8H6.2" />
    <circle cx="9.5" cy="19.5" r="1.3" />
    <circle cx="17" cy="19.5" r="1.3" />
  </svg>
);
const Shield = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s} {...p}>
    <path d="M12 3 5 6v5.5c0 4.4 2.9 7.5 7 9.5 4.1-2 7-5.1 7-9.5V6l-7-3z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
);
const Pin = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s} width={18} height={18} {...p}>
    <path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
const Globe = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s} width={18} height={18} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9S14.600 18.400 12 21c-2.600-2.600-3.900-5.600-3.900-9S9.400 5.600 12 3z" />
  </svg>
);
const Headset = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s} {...p}>
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <rect x="3" y="14" width="4" height="6" rx="1.5" />
    <rect x="17" y="14" width="4" height="6" rx="1.5" />
    <path d="M19 20c0 1.200-1.500 2-4 2" />
  </svg>
);
const Clock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const Gear = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.500M12 18.500V21M3 12h2.500M18.500 12H21M5.600 5.600l1.800 1.800M16.600 16.600l1.800 1.800M5.600 18.400l1.800-1.800M16.600 7.400l1.800-1.800" />
  </svg>
);

function Brand({ dark }: { dark?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${dark ? "text-white" : "text-ink"}`}>
      <span className="h-[52px] w-[52px] flex-none overflow-hidden rounded-full">
        <Image src="/logo-technoultra.png" alt="" width={52} height={52} priority className="h-full w-full scale-[1.2] object-cover" />
      </span>
      <Wordmark size={24} />
    </div>
  );
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[.04] px-4 py-3.5 text-[15px] font-bold leading-tight text-white">
      <span className="flex-none text-brand">{icon}</span>
      {children}
    </li>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = sp.next ? safeNext(sp.next, "") : "";
  return (
    <main id="contenido" tabIndex={-1} className="pt-safe pb-safe relative flex min-h-screen-dvh flex-col overflow-x-clip bg-[#0b0b0b] text-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_20%_8%,rgba(255,138,0,.20),transparent_70%),radial-gradient(50%_40%_at_90%_95%,rgba(255,138,0,.14),transparent_70%)]" />

      {/* Presentación de la marca */}
      <section className="relative flex flex-col px-5 pt-6 lg:px-[clamp(32px,5vw,72px)] lg:pb-0 lg:pt-10">
        <Brand dark />
        <div className="grid grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)] items-start gap-1 pt-6 sm:grid-cols-[auto_auto] sm:justify-center sm:gap-8 lg:block lg:pt-14">
          <div className="relative z-10 order-2 col-start-2 lg:order-none lg:max-w-[420px]">
            <h1 className="m-0 text-[clamp(22px,6.3vw,28px)] font-extrabold leading-[1.1] tracking-[-0.02em] lg:text-[clamp(38px,3.6vw,52px)]">
              <span className="block">Soluciones</span>
              <span className="block">de tecnología</span>
              <span className="block whitespace-nowrap text-brand">para tu día a día</span>
            </h1>
            <div className="mt-3 h-1 w-14 rounded-sm bg-brand" />
            <p className="m-0 mt-3 text-[13.5px] leading-snug text-white/85 lg:hidden">
              <span className="block">Servicio técnico · Páginas web</span>
              <span className="block">Aplicaciones · Soporte remoto</span>
            </p>
            <ul className="m-0 mt-8 hidden max-w-[560px] list-none grid-cols-2 gap-3 p-0 lg:grid">
              <Chip icon={<Wrench />}>Servicio técnico</Chip>
              <Chip icon={<Code />}>Páginas web y aplicaciones</Chip>
              <Chip icon={<Cart />}>Tienda de productos</Chip>
              <Chip icon={<Shield />}>Mantenimiento y soporte</Chip>
            </ul>
            <p className="m-0 mt-5 hidden items-center gap-x-4 gap-y-2 text-[14px] text-white/85 lg:flex lg:flex-wrap">
              <span className="flex items-center gap-1.5">
                <Pin className="text-brand" /> Cali · Palmira · Jamundí · Yumbo
              </span>
              <span className="flex items-center gap-1.5">
                <Globe className="text-brand" /> Soporte remoto en toda Colombia
              </span>
            </p>
          </div>
          <div className="relative order-1 col-start-1 h-[240px] sm:w-36 lg:max-[1399px]:hidden min-[1400px]:pointer-events-none min-[1400px]:absolute min-[1400px]:bottom-[76px] min-[1400px]:right-[2%] min-[1400px]:h-[min(68vh,620px)] min-[1400px]:w-[min(22vw,350px)]">
            <Image
              src="/login/mascota-v2.webp"
              alt=""
              width={560}
              height={905}
              priority
              sizes="(min-width:1400px) 380px, 140px"
              className="absolute bottom-0 left-0 h-full w-auto max-w-none object-contain object-bottom [mask-image:linear-gradient(to_bottom,#000_82%,transparent)] min-[1400px]:left-auto min-[1400px]:right-0"
            />
          </div>
        </div>
        <ul className="m-0 mt-auto hidden list-none items-center gap-8 border-t border-white/10 p-0 py-5 text-[14px] font-bold text-white/90 lg:flex">
          <li className="flex items-center gap-2.5"><span className="text-brand"><Headset /></span> Asesoría personalizada</li>
          <li className="flex items-center gap-2.5"><span className="text-brand"><Clock /></span> Tiempos claros de entrega</li>
          <li className="flex items-center gap-2.5"><span className="text-brand"><Gear /></span> Trabajo con garantía</li>
        </ul>
      </section>

      {/* Acceso: tarjeta centrada en su panel (móvil: hoja que se superpone al héroe) */}
      <section className="relative z-10 -mt-16 flex justify-center px-4 pb-8 lg:mt-0 lg:items-center lg:bg-gradient-to-br lg:from-white lg:to-paper lg:px-8 lg:py-10 lg:text-ink">
        <div aria-hidden className="pointer-events-none absolute right-0 top-0 hidden h-40 w-40 rounded-bl-[100%] bg-brand/90 lg:block" />
        <div className="relative w-full max-w-[460px] rounded-[28px] bg-white px-5 py-7 text-ink shadow-[0_30px_80px_-30px_rgba(0,0,0,.55)] sm:px-8 lg:ring-1 lg:ring-line">
          <div className="mb-5 hidden justify-center lg:flex">
            <Brand />
          </div>
          <h2 className="m-0 text-[32px] font-extrabold tracking-[-0.02em]">¡Bienvenido!</h2>
          <p className="m-0 mb-5 mt-1.5 text-[16px] leading-snug text-muted">Accede a tu cuenta para gestionar tus servicios, equipos y pedidos.</p>
          <div className="flex flex-col gap-4">
            <GoogleButton next={next || undefined} />
            <div className="flex items-center gap-3 text-[13px] font-semibold text-muted" aria-hidden>
              <span className="h-px flex-1 bg-line-strong" /> o continúa con tu correo <span className="h-px flex-1 bg-line-strong" />
            </div>
            <LoginForm next={next || undefined} notice={sp.error ? NOTICES[sp.error] : undefined} />
            <p className="m-0 flex flex-wrap items-center justify-center gap-x-1.5 text-center text-[15px] font-semibold text-muted">
              ¿No tienes cuenta?
              <Link href="/registro" className="flex min-h-11 items-center font-extrabold text-brand-text underline decoration-brand underline-offset-[3px]">
                Crear cuenta
              </Link>
            </p>
          </div>
          <div className="mt-1 flex justify-center border-t border-line pt-1">
            <Link href="/gestion/login" className="flex min-h-11 items-center text-[12px] font-semibold text-muted underline decoration-line-strong underline-offset-[3px] hover:text-ink">
              ¿Eres del equipo? Acceso de personal
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
