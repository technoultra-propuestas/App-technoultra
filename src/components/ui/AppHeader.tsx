import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { IconLogout } from "@/components/ui/icons";
import { signOutAction } from "@/app/(auth)/actions";

/** Cabecera de la app autenticada (respeta notch/Dynamic Island con la safe-area). */
export function AppHeader({ home, name, roleLabel, unread = 0 }: { home: string; name: string; roleLabel: string; unread?: number }) {
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1040px] items-center justify-between gap-3 px-5 py-3">
        <Link href={home} className="no-underline" aria-label="Inicio">
          <Wordmark size={19} />
        </Link>
        <div className="flex items-center gap-3">
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-[14px] font-extrabold">{name || "Mi cuenta"}</div>
            <div className="text-[12px] font-semibold text-muted">{roleLabel}</div>
          </div>
          <Link
            href="/avisos"
            aria-label={unread > 0 ? `Avisos, ${unread} sin leer` : "Avisos"}
            className="relative flex h-11 w-11 items-center justify-center rounded-[14px] border border-line bg-white text-ink no-underline"
          >
            <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            {unread > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-extrabold text-ink">{unread > 9 ? "9+" : unread}</span>
            ) : null}
          </Link>
          <form action={signOutAction}>
            <button type="submit" aria-label="Cerrar sesión" className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-line bg-white">
              <IconLogout width={20} height={20} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
