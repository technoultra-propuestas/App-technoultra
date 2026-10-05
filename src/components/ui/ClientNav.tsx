"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; exact?: boolean; also?: string[] };
const ITEMS: Item[] = [
  { href: "/c", label: "Inicio", exact: true },
  { href: "/c/solicitar", label: "Servicios" },
  { href: "/c/tickets", label: "Tickets" },
  { href: "/c/tienda", label: "Tienda", also: ["/c/carrito", "/c/pedidos"] },
  { href: "/c/mas", label: "Más", also: ["/c/equipos", "/c/proyectos", "/c/documentos", "/c/direcciones", "/c/perfil", "/c/legal"] },
];

/** Navegación inferior en móvil (con safe-area del iPhone) y superior en pantallas anchas. */
export function ClientNav() {
  const path = usePathname();
  const active = (i: Item) => {
    const hit = (p: string) => path === p || path.startsWith(p + "/");
    return i.exact ? path === i.href : hit(i.href) || (i.also ?? []).some(hit);
  };
  return (
    <nav
      aria-label="Principal"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur md:static md:border-t-0 md:bg-transparent md:backdrop-blur-none"
    >
      <ul className="m-0 mx-auto flex max-w-[1040px] list-none justify-around gap-1 p-1.5 md:justify-start md:gap-2 md:px-5">
        {ITEMS.map((i) => (
          <li key={i.href} className="flex-1 md:flex-none">
            <Link
              href={i.href}
              aria-current={active(i) ? "page" : undefined}
              className={`flex min-h-12 items-center justify-center rounded-[14px] px-3 text-[14px] font-extrabold no-underline transition-colors duration-200 md:px-4 md:text-[15px] ${
                active(i) ? "bg-ink text-white" : "text-ink-2"
              }`}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
