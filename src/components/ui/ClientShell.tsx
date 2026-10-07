import { BottomNav, RailNav, type NavItem } from "@/components/ui/AppNav";
import { AppTopBar } from "@/components/ui/AppTopBar";

/** Misma estructura que el panel del personal, con los destinos del cliente (el producto se siente uno solo). */
const ITEMS: NavItem[] = [
  { href: "/c", label: "Inicio", icon: "home", exact: true },
  { href: "/c/solicitar", label: "Servicios", icon: "wrench" },
  { href: "/c/tickets", label: "Tickets", icon: "ticket" },
  { href: "/tienda", label: "Shop", icon: "store", also: ["/c/tienda", "/c/carrito", "/c/pedidos"] },
];
const MORE_ALSO = ["/c/equipos", "/c/proyectos", "/c/documentos", "/c/direcciones", "/c/perfil", "/c/legal", "/c/ayuda", "/c/asistente"];

export function ClientShell({ children, name, unread }: { children: React.ReactNode; name: string; unread: number }) {
  return (
    <div className="min-h-screen-dvh lg:pl-[84px]">
      <RailNav items={ITEMS} moreHref="/c/mas" home="/c" accountHref="/c/perfil" name={name} unread={unread} />
      <AppTopBar home="/c" unread={unread} />
      <div id="contenido" tabIndex={-1} className="enter mx-auto max-w-[1040px] px-5 pb-28 pt-6 outline-none lg:px-9 lg:pb-12 lg:pt-8">
        {children}
      </div>
      <BottomNav items={ITEMS} moreHref="/c/mas" moreAlso={MORE_ALSO} />
    </div>
  );
}
