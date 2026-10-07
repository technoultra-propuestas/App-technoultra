import type { Metadata } from "next";
import { ListRow } from "@/components/ui/kit";
import { SignOutRow } from "@/components/ui/SignOut";
import type { NavIconName } from "@/components/ui/icons";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Más", robots: { index: false } };

type Entry = { href: string; title: string; detail: string; icon: NavIconName };
type Group = { title: string; admin?: boolean; items: Entry[] };

/**
 * Todo lo que no cabe en la barra principal, agrupado por área. Los grupos «admin» se ocultan al técnico por comodidad:
 * cada ruta vuelve a validar el rol en el servidor y las políticas RLS son la barrera real.
 */
const GROUPS: Group[] = [
  {
    title: "Operación",
    items: [
      { href: "/b/solicitudes", title: "Solicitudes", detail: "Peticiones de clientes por atender", icon: "inbox" },
      { href: "/b/proyectos", title: "Proyectos digitales", detail: "Servicios digitales y entregables", icon: "folder" },
      { href: "/b/pedidos", title: "Pedidos de la tienda", detail: "Compras, envíos e instalación", icon: "box" },
      { href: "/avisos", title: "Avisos", detail: "Notificaciones del panel", icon: "bell" },
    ],
  },
  {
    title: "Catálogo y negocio",
    admin: true,
    items: [
      { href: "/b/servicios", title: "Servicios", detail: "Catálogo, precios y reglas", icon: "wrench" },
      { href: "/b/tienda", title: "Productos", detail: "Inventario, precios y garantía", icon: "store" },
      { href: "/b/tienda/shop", title: "Shop", detail: "Banner, textos, envíos y destacados", icon: "store" },
      { href: "/b/conocimiento", title: "Centro de conocimiento", detail: "Respuestas del asistente y uso de IA", icon: "folder" },
      { href: "/b/comercial", title: "Comercial", detail: "IVA, urgencia, domicilio y diagnóstico", icon: "quote" },
      { href: "/b/cobertura", title: "Cobertura", detail: "Ciudades con servicio presencial", icon: "map" },
      { href: "/b/reportes", title: "Reportes", detail: "Indicadores del negocio", icon: "chart" },
    ],
  },
  {
    title: "Legal y privacidad",
    admin: true,
    items: [
      { href: "/b/legal", title: "Centro legal", detail: "Documentos, versiones y aceptaciones", icon: "scale" },
      { href: "/b/privacidad", title: "Privacidad", detail: "Solicitudes de datos y supresión", icon: "lock" },
    ],
  },
  {
    title: "Equipo y seguridad",
    items: [
      { href: "/b/usuarios", title: "Usuarios del equipo", detail: "Técnicos y accesos", icon: "users" },
      { href: "/b/configuracion", title: "Ajustes", detail: "Datos del negocio y parámetros", icon: "settings" },
      { href: "/b/seguridad", title: "Seguridad de mi cuenta", detail: "Contraseña y verificación en dos pasos", icon: "shield" },
    ],
  },
];
const ADMIN_ONLY = new Set(["/b/solicitudes", "/b/proyectos", "/b/pedidos", "/b/usuarios", "/b/configuracion"]);

export default async function StaffMorePage() {
  const profile = await requireRole(["technician", "superadmin"]);
  const isAdmin = profile.role === "superadmin";
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => isAdmin || (!g.admin && !ADMIN_ONLY.has(i.href))) })).filter((g) => g.items.length > 0);
  return (
    <section className="flex flex-col gap-6">
      <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">Más</h1>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        {groups.map((g) => (
          <section key={g.title} className="rounded-card border border-line bg-white p-4 shadow-card">
            <h2 className="m-0 mb-1 px-2 text-[13px] font-extrabold uppercase tracking-[0.06em] text-muted">{g.title}</h2>
            <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
              {g.items.map((i) => (
                <li key={i.href}>
                  <ListRow href={i.href} title={i.title} detail={i.detail} icon={i.icon} tone="neutral" />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="max-w-[420px]">
        <SignOutRow />
      </div>
    </section>
  );
}
