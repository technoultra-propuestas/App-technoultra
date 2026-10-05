"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; exact?: boolean; admin?: boolean };
const ITEMS: Item[] = [
  { href: "/b", label: "Panel", exact: true },
  { href: "/b/tickets", label: "Tickets" },
  { href: "/b/solicitudes", label: "Solicitudes", admin: true },
  { href: "/b/servicios", label: "Servicios", admin: true },
  { href: "/b/cobertura", label: "Cobertura", admin: true },
  { href: "/b/usuarios", label: "Usuarios", admin: true },
];

/** Los enlaces administrativos solo se ocultan por comodidad: cada ruta y acción valida el rol en el servidor. */
export function StaffNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const items = ITEMS.filter((i) => !i.admin || isAdmin);
  return (
    <nav aria-label="Principal" className="mx-auto max-w-[1040px] overflow-x-auto px-5 pt-3">
      <ul className="m-0 flex list-none gap-2 p-0">
        {items.map((i) => {
          const on = i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/");
          return (
            <li key={i.href} className="flex-none">
              <Link
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-[14px] px-4 text-[14px] font-extrabold no-underline ${on ? "bg-ink text-white" : "border border-line bg-white text-ink-2"}`}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
