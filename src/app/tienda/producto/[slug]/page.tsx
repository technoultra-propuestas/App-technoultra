import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site/SiteShell";
import { ProductImage, optimizedImage } from "@/components/store/ProductImage";
import { ShippingInfo } from "@/components/store/ShippingInfo";
import { WhatsappCta } from "@/components/store/WhatsappCta";
import { copFormat } from "@/lib/catalog/normalize";
import { getProductBySlug } from "@/lib/catalog/queries";
import { productWhatsappUrl } from "@/lib/catalog/whatsapp";
import { breadcrumbLd, jsonLd, siteUrl } from "@/lib/seo";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await getProductBySlug((await params).slug);
  if (!p) return { title: "Producto no disponible", robots: { index: false } };
  const desc = (p.description ?? p.name).replace(/\s+/g, " ").slice(0, 155);
  return {
    title: p.name,
    description: desc,
    alternates: { canonical: `/tienda/producto/${p.slug}` },
    openGraph: { title: p.name, description: desc, images: p.image_url ? [{ url: optimizedImage(p.image_url, 800) }] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const p = await getProductBySlug((await params).slug);
  // Sin disponibilidad, oculto por el administrador o inexistente: la base de datos (RLS) no lo devuelve → 404.
  if (!p) notFound();
  const wa = productWhatsappUrl({ name: p.name, ref: p.source_ref, price: p.price, brand: p.brand, category: p.category?.name, subcategory: p.subcategory?.name });
  const crumbs = [
    { name: "Inicio", path: "/" },
    { name: "Tienda", path: "/tienda" },
    ...(p.category ? [{ name: p.category.name, path: `/tienda/categoria/${p.category.slug}` }] : []),
    ...(p.category && p.subcategory ? [{ name: p.subcategory.name, path: `/tienda/categoria/${p.category.slug}/${p.subcategory.slug}` }] : []),
    { name: p.name, path: `/tienda/producto/${p.slug}` },
  ];
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.source_ref ?? undefined,
    brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
    description: p.description ?? undefined,
    image: p.image_url ? [optimizedImage(p.image_url, 800)] : undefined,
    offers: { "@type": "Offer", url: `${siteUrl()}/tienda/producto/${p.slug}`, priceCurrency: "COP", price: p.price, availability: "https://schema.org/InStock", seller: { "@type": "Organization", name: "TechnoUltra" } },
  };
  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd(crumbs)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(product) }} />
      <nav aria-label="Ruta" className="mb-5 flex flex-wrap items-center gap-x-2 text-[13px] font-semibold text-muted">
        {crumbs.slice(1, -1).map((c) => (
          <span key={c.path} className="flex items-center gap-2">
            <Link href={c.path} className="flex min-h-11 items-center text-muted">{c.name}</Link>
            <span aria-hidden>›</span>
          </span>
        ))}
        <span className="line-clamp-1 text-ink">{p.name}</span>
      </nav>
      <div className="grid gap-8 md:grid-cols-2">
        <ProductImage src={p.image_url} alt={p.name} width={900} eager className="aspect-square w-full rounded-card border border-line" />
        <div className="flex flex-col gap-4">
          {p.brand ? <span className="text-[13px] font-extrabold uppercase tracking-[0.05em] text-muted">{p.brand}</span> : null}
          <h1 className="m-0 text-[28px] font-extrabold leading-tight tracking-[-0.02em]">{p.name}</h1>
          {p.source_ref ? <span className="text-[13px] font-semibold text-muted">Referencia: {p.source_ref}</span> : null}
          <div className="text-[34px] font-extrabold tracking-[-0.02em]">{copFormat(p.price)}</div>
          <div>
            <div className="text-[15px] font-extrabold text-ok">🟢 1 unidad disponible</div>
            <p className="m-0 mt-1 text-[13px] text-muted">Disponibilidad y precio sujetos a confirmación por WhatsApp.</p>
          </div>
          <WhatsappCta productId={p.id} href={wa} />
          <ShippingInfo />
          {p.warranty_days > 0 ? <p className="m-0 text-[14px] font-semibold text-ink-2">Garantía: {p.warranty_days} días.</p> : null}
        </div>
      </div>
      {p.description ? (
        <section className="mt-10 max-w-[720px]">
          <h2 className="m-0 mb-2 text-[20px] font-extrabold">Descripción</h2>
          <p className="m-0 whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{p.description}</p>
        </section>
      ) : null}
    </SiteShell>
  );
}
