import Link from "next/link";
import { BottomNav, RailNav, type NavItem } from "@/components/ui/AppNav";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { NavIcon } from "@/components/ui/icons";

/** Destinos del riel (escritorio). Los marcados `admin` solo se muestran al SUPERADMIN; cada ruta valida el rol en el servidor. */
const RAIL: (NavItem & { admin?: boolean })[] = [
  { href: "/b", label: "Inicio", icon: "home", exact: true },
  { href: "/b/tickets", label: "Tickets", icon: "ticket", also: ["/b/solicitudes"] },
  { href: "/b/clientes", label: "Clientes", icon: "users" },
  { href: "/b/cotizaciones", label: "Cotizar", icon: "quote" },
  { href: "/b/agenda", label: "Agenda", icon: "calendar" },
  { href: "/b/crm", label: "CRM", icon: "crm" },
  { href: "/b/tienda", label: "Tienda", icon: "store", admin: true, also: ["/b/pedidos"] },
  { href: "/b/reportes", label: "Reportes", icon: "chart", admin: true },
];
/** Barra inferior (móvil): cuatro destinos + «Más», como en el mockup. */
const BOTTOM: NavItem[] = [
  { href: "/b", label: "Inicio", icon: "home", exact: true },
  { href: "/b/tickets", label: "Tickets", icon: "ticket", also: ["/b/solicitudes", "/b/clientes", "/b/cotizaciones"] },
  { href: "/b/agenda", label: "Agenda", icon: "calendar" },
  { href: "/b/crm", label: "CRM", icon: "crm" },
];

/**
 * Estructura del panel del personal: riel lateral en escritorio; cabecera oscura compacta + barra inferior en móvil.
 * Es solo presentación: el acceso lo decide el servidor (layout + RLS), nunca este componente.
 */
export function StaffShell({ children, name, isAdmin, unread }: { children: React.ReactNode; name: string; isAdmin: boolean; unread: number }) {
  return (
    <div className="min-h-screen-dvh lg:pl-[84px]">
      <RailNav items={RAIL.filter((i) => !i.admin || isAdmin)} moreHref="/b/mas" home="/b" accountHref="/b/seguridad" name={name} unread={unread} />
      <AppTopBar home="/b" unread={unread} />
      <div id="contenido" tabIndex={-1} className="enter mx-auto max-w-[1290px] px-5 pb-28 pt-6 outline-none lg:px-9 lg:pb-12 lg:pt-8">
        {children}
      </div>
      {isAdmin ? (
        <Link
          href="/b/mas"
          className="press fixed bottom-[76px] right-4 z-20 inline-flex min-h-11 items-center gap-2 rounded-chip border border-line bg-white px-4 text-[13px] font-extrabold text-ink no-underline shadow-pop lg:bottom-5 lg:right-6"
        >
          <NavIcon name="settings" width={16} height={16} className="text-brand" />
          Administración
        </Link>
      ) : null}
      <BottomNav items={BOTTOM} moreHref="/b/mas" />
    </div>
  );
}
