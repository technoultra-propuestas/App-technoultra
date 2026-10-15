import type { Metadata } from "next";
import { ListRow } from "@/components/ui/kit";
import type { NavIconName } from "@/components/ui/icons";
import { SignOutRow } from "@/components/ui/SignOut";
import { InstallApp } from "@/components/pwa/InstallApp";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Más", robots: { index: false } };

const LINKS: { href: string; label: string; text: string; icon: NavIconName }[] = [
  { href: "/c/asistente", label: "Asistente", text: "Te orienta con servicios, precios y el estado de tus solicitudes.", icon: "inbox" },
  { href: "/c/equipos", label: "Mis equipos", text: "Registra y consulta tus equipos y su historial.", icon: "box" },
  { href: "/tienda", label: "Shop", text: "Productos con garantía; compra por WhatsApp.", icon: "store" },
  { href: "/c/pedidos", label: "Mis pedidos", text: "Pedidos pagados en línea y estado del pago.", icon: "box" },
  { href: "/c/proyectos", label: "Mis proyectos", text: "Avance de tus soluciones digitales.", icon: "folder" },
  { href: "/c/documentos", label: "Documentos", text: "Actas, cotizaciones, garantías y firmas.", icon: "quote" },
  { href: "/c/direcciones", label: "Direcciones", text: "Dónde recogemos o atendemos.", icon: "map" },
  { href: "/c/perfil", label: "Mi perfil", text: "Tus datos y preferencias de notificaciones.", icon: "users" },
  { href: "/notificaciones", label: "Notificaciones", text: "Novedades de tus servicios.", icon: "bell" },
  { href: "/c/ayuda", label: "Ayuda", text: "Preguntas frecuentes, asistente y contacto.", icon: "shield" },
  { href: "/soporte-remoto", label: "Soporte remoto", text: "Asistencia técnica desde tu casa.", icon: "wrench" },
];

export default async function MorePage() {
  await requireRole(["client"]);
  return (
    <section className="flex flex-col gap-6">
      <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">Más</h1>
      <div className="max-w-[640px] rounded-card border border-line bg-white p-3 shadow-card lg:max-w-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:divide-y-0">
          {LINKS.map((l) => (
            <li key={l.href} className="lg:rounded-card lg:border lg:border-line lg:bg-white lg:px-2 lg:shadow-card">
              <ListRow href={l.href} title={l.label} detail={l.text} icon={l.icon} tone="neutral" />
            </li>
          ))}
        </ul>
      </div>
      <div className="max-w-[640px] lg:max-w-[calc(50%-6px)]">
        <InstallApp />
      </div>
      <div className="max-w-[640px] lg:max-w-[calc(50%-6px)]">
        <SignOutRow />
      </div>
    </section>
  );
}
