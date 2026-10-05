import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/Wordmark";

/**
 * Puerta del PERSONAL: fondo oscuro y tarjeta clara, distinta a propósito del acceso de clientes para que se entienda que son dos
 * entradas. En escritorio, panel de marca a la izquierda y formulario a la derecha. La safe-area va en <main> (pisa el padding).
 */
export function StaffAuthShell({ title, subtitle, children, back }: { title: string; subtitle?: string; children: ReactNode; back?: { href: string; label: string } }) {
  return (
    <main id="contenido" tabIndex={-1} className="pt-safe pb-safe min-h-screen-dvh bg-ink text-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
      <section className="hidden flex-col justify-between bg-[#0B0B0B] p-12 lg:flex xl:p-16">
        <Wordmark size={26} />
        <div className="flex max-w-[460px] flex-col gap-4">
          <p className="m-0 text-[13px] font-bold tracking-[0.14em] text-brand">GESTIÓN Y OPERACIONES</p>
          <h2 className="m-0 text-[40px] leading-[1.1] font-extrabold tracking-[-0.025em] xl:text-[46px]">Todo el servicio, en un solo lugar.</h2>
          <p className="m-0 text-[17px] leading-relaxed text-[#C9C9C5]">Tickets, cotizaciones, catálogo y clientes. Acceso protegido con verificación en dos pasos.</p>
        </div>
        <p className="m-0 text-[13px] text-[#8A8A86]">Acceso exclusivo para personal autorizado.</p>
      </section>
      <section className="mx-auto flex w-full max-w-[480px] flex-col justify-center gap-6 px-5 py-8 md:px-8 lg:max-w-none lg:px-14 lg:py-12">
        <div className="flex flex-col gap-2 lg:hidden">
          <Wordmark size={22} />
          <p className="m-0 mt-1 text-[12px] font-bold tracking-[0.14em] text-brand">GESTIÓN Y OPERACIONES</p>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[28px] leading-tight font-extrabold tracking-[-0.025em] md:text-[32px]">{title}</h1>
          <div className="h-1 w-10 rounded-sm bg-brand" />
          {subtitle ? <p className="m-0 mt-1 text-[16px] leading-normal text-[#C9C9C5]">{subtitle}</p> : null}
        </div>
        <div className="rounded-3xl bg-white p-5 text-ink md:p-6">{children}</div>
        {back ? (
          <Link href={back.href} className="flex min-h-11 w-fit items-center text-[14px] font-bold text-[#C9C9C5] underline decoration-brand underline-offset-[3px]">
            {back.label}
          </Link>
        ) : null}
        <p className="m-0 text-[12px] text-[#8A8A86] lg:hidden">Acceso exclusivo para personal autorizado.</p>
      </section>
    </main>
  );
}
