import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/catalog/queries";

/**
 * Comprueba que la ficha exista ANTES del límite de carga (`loading.tsx`): así un producto retirado, sin stock o inexistente responde con un
 * 404 HTTP real aunque el resto de la página se transmita con esqueleto. La lectura está cacheada (60 s) y la reutiliza la propia página,
 * por lo que no cuesta una consulta extra.
 */
export default async function ProductLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const product = await getProductBySlug((await params).slug);
  if (!product) notFound();
  return children;
}
