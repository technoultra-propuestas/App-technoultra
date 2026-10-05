import Link from "next/link";
import type { ReactNode } from "react";

/** Contenedor de pantallas de acceso: ancho 480, botón volver, título con barra naranja (diseño aprobado). */
export function AuthShell({
  title,
  subtitle,
  back,
  children,
  dark = false,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <main className={`min-h-screen-dvh ${dark ? "bg-ink text-white" : ""}`}>
      <div className="pt-safe pb-safe mx-auto flex max-w-[480px] flex-col gap-[18px] px-5 py-5 pb-10">
        {back ? (
          <Link
            href={back}
            aria-label="Volver"
            className={`flex h-12 w-12 items-center justify-center rounded-[14px] border ${
              dark ? "border-none bg-[#262626] text-white" : "border-line bg-white"
            }`}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </Link>
        ) : null}
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">{title}</h1>
          <div className="h-1 w-10 rounded-sm bg-brand" />
          {subtitle ? (
            <p className={`m-0 mt-1 text-base leading-normal ${dark ? "text-[#C9C9C5]" : "text-muted"}`}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </main>
  );
}
