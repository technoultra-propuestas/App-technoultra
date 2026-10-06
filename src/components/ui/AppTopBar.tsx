import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { NavIcon } from "@/components/ui/icons";

/** Cabecera oscura compacta para móvil (respeta notch / Dynamic Island con la safe-area). En escritorio la reemplaza el riel. */
export function AppTopBar({ home, unread }: { home: string; unread: number }) {
  return (
    <header className="pt-safe sticky top-0 z-20 bg-black text-white lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href={home} aria-label="Inicio" className="text-white no-underline">
          <Wordmark size={19} />
        </Link>
        <Link
          href="/avisos"
          aria-label={unread > 0 ? `Avisos, ${unread} sin leer` : "Avisos"}
          className="press relative flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#1F1F1F] text-white"
        >
          <NavIcon name="bell" width={20} height={20} />
          {unread > 0 ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-extrabold text-ink">{unread > 9 ? "9+" : unread}</span> : null}
        </Link>
      </div>
    </header>
  );
}
