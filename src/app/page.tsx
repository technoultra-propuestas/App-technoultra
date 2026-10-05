import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand/Wordmark";
import { IconSearch, IconShieldCheck, IconSparkles, IconTimeline } from "@/components/ui/icons";
import { getProfile } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/routes";

const perks = [
  { Icon: IconSparkles, text: "Diagnóstico preliminar con IA antes de llevar tu equipo" },
  { Icon: IconTimeline, text: "Seguimiento de tu servicio en todo momento" },
  { Icon: IconShieldCheck, text: "Garantía registrada en cada servicio y producto" },
];

export default async function WelcomePage() {
  const profile = await getProfile();
  if (profile?.is_active) {
    redirect(
      profile.role === "client" && !profile.onboarding_completed_at ? "/onboarding" : roleHome(profile.role),
    );
  }

  return (
    <main id="contenido" tabIndex={-1} className="min-h-screen-dvh flex flex-col">
      <header className="pt-safe rounded-b-[32px] bg-ink px-5 pb-10 pt-10 text-white sm:px-[clamp(20px,6vw,64px)]">
        <div className="mx-auto flex max-w-[1040px] flex-col gap-[22px]">
          <div className="flex items-center gap-3">
            <div className="h-[52px] w-[52px] overflow-hidden rounded-full">
              <Image
                src="/logo-technoultra.png"
                alt=""
                width={52}
                height={52}
                priority
                className="h-full w-full scale-[1.2] object-cover"
              />
            </div>
            <Wordmark size={20} />
          </div>
          <h1 className="m-0 text-[clamp(36px,7vw,64px)] font-extrabold uppercase leading-[1.02] tracking-[-0.03em]">
            Tu equipo funcionando <span className="text-brand">de nuevo</span>
          </h1>
          <div className="h-[5px] w-12 rounded-[3px] bg-brand" />
          <p className="m-0 max-w-[560px] text-lg leading-normal text-[#C9C9C5] [text-wrap:pretty]">
            Servicio técnico y soluciones digitales en Cali, Palmira, Jamundí y Yumbo, y soporte remoto en
            toda Colombia. Te explicamos todo de forma sencilla y puedes ver cada paso desde tu celular.
          </p>
        </div>
      </header>

      <section className="pb-safe mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-4 px-5 pb-10 pt-8">
        <ul className="mb-2 flex list-none flex-col gap-3.5 p-0">
          {perks.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-3.5">
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] bg-white">
                <Icon />
              </span>
              <span className="text-base font-semibold leading-[1.4]">{text}</span>
            </li>
          ))}
        </ul>
        <Link
          href="/login"
          className="flex min-h-[58px] items-center justify-center rounded-2xl bg-brand text-[17px] font-extrabold text-ink no-underline"
        >
          Iniciar sesión
        </Link>
        <Link
          href="/registro"
          className="flex min-h-[58px] items-center justify-center rounded-2xl border-[1.5px] border-line-strong bg-white text-[17px] font-extrabold text-ink no-underline"
        >
          Crear cuenta
        </Link>
        <Link
          href="/seguimiento"
          className="flex min-h-[52px] items-center justify-center gap-2 text-base font-bold text-ink no-underline"
        >
          <IconSearch width={22} height={22} />
          Consultar un ticket sin iniciar sesión
        </Link>
      </section>
    </main>
  );
}
