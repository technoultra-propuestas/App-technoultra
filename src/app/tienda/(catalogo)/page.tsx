import type { Metadata } from "next";
import { breadcrumbLd, jsonLd } from "@/lib/seo";
import { CatalogView } from "../catalog-view";

export const metadata: Metadata = {
  title: "Tienda de tecnología",
  description: "Periféricos, almacenamiento, componentes, redes y accesorios con garantía de TechnoUltra. Consulta disponibilidad y compra por WhatsApp, con entrega en Cali.",
  alternates: { canonical: "/tienda" },
};

export default async function StorePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd([{ name: "Inicio", path: "/" }, { name: "Tienda", path: "/tienda" }])) }} />
      <CatalogView sp={await searchParams} />
    </>
  );
}

