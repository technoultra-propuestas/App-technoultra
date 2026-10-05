import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Más", robots: { index: false } };

const LINKS = [
  { href: "/c/equipos", label: "Mis equipos", text: "Registra y consulta tus equipos y su historial." },
  { href: "/c/pedidos", label: "Mis pedidos", text: "Compras de la tienda y estado del pago." },
  { href: "/c/proyectos", label: "Mis proyectos", text: "Avance de tus soluciones digitales." },
  { href: "/c/documentos", label: "Documentos", text: "Actas, cotizaciones, garantías y firmas." },
  { href: "/c/direcciones", label: "Direcciones", text: "Dónde recogemos o atendemos." },
  { href: "/c/perfil", label: "Mi perfil", text: "Tus datos y preferencias de avisos." },
  { href: "/avisos", label: "Avisos", text: "Novedades de tus servicios." },
  { href: "/soporte-remoto", label: "Soporte remoto", text: "Asistencia técnica desde tu casa." },
];

export default async function MorePage() {
  await requireRole(["client"]);
  return (
    <section className="flex flex-col gap-6">
      <PageTitle title="Más" />
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3 p-0">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block h-full no-underline">
              <Card className="flex h-full flex-col gap-1">
                <span className="text-[17px] font-extrabold text-ink">{l.label}</span>
                <span className="text-[14px] text-muted">{l.text}</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
