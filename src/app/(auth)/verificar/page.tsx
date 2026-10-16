import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand/Wordmark";
import { createClient } from "@/lib/supabase/server";
import { CheckEmailPanel } from "../forms";

export const metadata: Metadata = { title: "Revisa tu correo", robots: { index: false } };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const email = (sp.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) redirect("/login");
  const mode = sp.mode === "recovery" ? "recovery" : "signup";
  // Quien ya confirmó (otra pestaña, o vuelve atrás tras confirmar) no necesita esta pantalla: "/" decide onboarding o su inicio.
  const { data } = await (await createClient()).auth.getUser();
  if (data.user) redirect("/");
  const back = mode === "recovery" ? "/recuperar" : "/registro";
  return (
    <main id="contenido" tabIndex={-1} className="pt-safe pb-safe relative isolate flex min-h-screen-dvh flex-col overflow-clip bg-[#FBF8F4] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(500px,45%)]">
      {/* Escena (escritorio): ilustración a pantalla completa; la tarjeta real cubre el hueco donde estaba la del diseño. */}
      <Image src="/auth/correo-fondo.webp" alt="" fill priority sizes="100vw" className="-z-10 hidden object-cover object-[left_40%] lg:block" />

      <section className="relative px-5 pt-6 lg:px-[clamp(32px,4.5vw,72px)] lg:pt-9">
        <div className="flex items-center gap-3 text-ink">
          <Image src="/login/logo-circulo.webp" alt="" width={72} height={72} priority className="h-[60px] w-[60px] lg:h-[68px] lg:w-[68px]" />
          <div className="flex flex-col gap-1">
            <Wordmark size={26} />
            <span className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-muted">Tu mundo tecnológico en un solo lugar</span>
          </div>
        </div>
        {/* Escena (móvil y tableta) */}
        <div aria-hidden className="relative mx-auto -mb-14 mt-2 h-[270px] w-[290px] overflow-hidden [mask-image:radial-gradient(ellipse_50%_62%_at_50%_42%,#000_60%,transparent_100%)] lg:hidden">
          <Image src="/auth/correo-movil.webp" alt="" width={740} height={712} priority sizes="290px" className="absolute left-0 top-0 h-auto w-[290px] max-w-none" />
        </div>
      </section>

      <section className="relative z-10 flex justify-center px-4 pb-8 lg:items-center lg:px-8 lg:py-10">
        <div className="w-full max-w-[clamp(520px,40vw,780px)] rounded-[28px] bg-white px-5 py-6 shadow-[0_30px_80px_-30px_rgba(120,60,0,.35)] ring-1 ring-black/5 sm:px-8 sm:py-8">
          <Link
            href={back}
            aria-label="Volver"
            className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-line bg-white text-ink shadow-[0_6px_16px_-10px_rgba(0,0,0,.4)]"
          >
            <svg aria-hidden viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="m-0 mt-6 text-[34px] font-extrabold leading-[1.1] tracking-[-0.025em] sm:text-[40px] lg:text-[clamp(40px,3vw,54px)]">
            Revisa <span className="text-brand">tu correo</span>
          </h1>
          <div className="mt-3 h-1 w-14 rounded-sm bg-brand" />
          <p className="m-0 mt-4 text-[16px] leading-relaxed text-ink-2 lg:text-[clamp(16px,1.1vw,19px)]">
            {mode === "recovery" ? (
              <>
                Si existe una cuenta con <strong className="font-extrabold text-ink">{email}</strong>, te enviamos un enlace para crear una contraseña nueva.
              </>
            ) : (
              <>
                Te enviamos un enlace de verificación a <strong className="font-extrabold text-ink">{email}</strong>. Abre el correo y haz clic en el enlace para
                confirmar tu cuenta. Después volverás automáticamente a TechnoUltra.
              </>
            )}
          </p>
          <div className="mt-5">
            <CheckEmailPanel email={email} mode={mode} />
          </div>
        </div>
      </section>
    </main>
  );
}
