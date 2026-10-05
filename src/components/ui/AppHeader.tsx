import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { IconLogout } from "@/components/ui/icons";
import { signOutAction } from "@/app/(auth)/actions";

/** Cabecera de la app autenticada (respeta notch/Dynamic Island con la safe-area). */
export function AppHeader({ home, name, roleLabel }: { home: string; name: string; roleLabel: string }) {
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
          <form action={signOutAction}>
            <button
              type="submit"
              aria-label="Cerrar sesión"
              className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-line bg-white"
            >
              <IconLogout width={20} height={20} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
