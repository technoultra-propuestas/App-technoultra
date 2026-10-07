import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

/** Estructura de las páginas públicas (servicios, cobertura): encabezado de marca y pie con enlaces legales. */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen-dvh flex flex-col">
      <header className="pt-safe border-b border-line bg-paper">
        <div className="mx-auto flex max-w-[1040px] items-center justify-between gap-3 px-5 py-3">
          <Link href="/" className="no-underline" aria-label="TechnoUltra, inicio">
            <Wordmark size={19} />
          </Link>
          <nav aria-label="Principal" className="flex items-center gap-2 text-[14px] font-extrabold">
            <Link href="/servicios" className="hidden px-3 py-2 text-ink no-underline sm:block">Servicios</Link>
            <Link href="/tienda" className="px-3 py-2 text-ink no-underline">Tienda</Link>
            <Link href="/soporte-remoto" className="hidden px-3 py-2 text-ink no-underline sm:block">Soporte remoto</Link>
            <Link href="/login" className="rounded-[12px] bg-ink px-4 py-2.5 text-white no-underline">Ingresar</Link>
          </nav>
        </div>
      </header>
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-[1040px] flex-1 px-5 py-8">{children}</main>
      <footer className="pb-safe border-t border-line bg-white">
        <div className="mx-auto flex max-w-[1040px] flex-wrap gap-x-5 gap-y-2 px-5 py-5 text-[13px] font-semibold text-muted">
          <Link href="/legal/terms" className="flex min-h-11 items-center text-muted">Términos</Link>
          <Link href="/legal/privacy" className="flex min-h-11 items-center text-muted">Privacidad</Link>
          <Link href="/legal/data_policy" className="flex min-h-11 items-center text-muted">Tratamiento de datos</Link>
          <Link href="/legal/warranty_policy" className="flex min-h-11 items-center text-muted">Garantías</Link>
          <Link href="/legal/returns_policy" className="flex min-h-11 items-center text-muted">Reembolsos</Link>
          <Link href="/legal" className="flex min-h-11 items-center font-extrabold text-ink">Todos los documentos</Link>
        </div>
      </footer>
    </div>
  );
}
