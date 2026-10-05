import { createPublicClient } from "@/lib/supabase/public";

export const siteUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Serializa JSON-LD de forma segura para incrustarlo en <script>: escapa `<` para impedir cierre prematuro de la etiqueta. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

export type BusinessInfo = { name: string; phone?: string; email?: string; address?: string };

/** Datos del negocio SOLO si el administrador los cargó (nunca se inventan). Claves públicas de app_settings. */
export async function loadBusinessInfo(): Promise<BusinessInfo> {
  const { data } = await createPublicClient().from("app_settings").select("key, value").in("key", ["business.name", "business.phone", "business.email", "business.address"]);
  const m = Object.fromEntries((data ?? []).map((r) => [r.key, typeof r.value === "string" ? r.value : undefined]));
  return { name: m["business.name"] || "TechnoUltra", phone: m["business.phone"], email: m["business.email"], address: m["business.address"] };
}

export function organizationLd(b: BusinessInfo, areas: string[]) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: b.name,
    url: siteUrl(),
    logo: `${siteUrl()}/icons/icon-512.png`,
    ...(b.email ? { email: b.email } : {}),
    ...(b.phone ? { telephone: b.phone } : {}),
    areaServed: [...areas.map((a) => ({ "@type": "City", name: a })), { "@type": "Country", name: "Colombia" }],
  };
}

/** LocalBusiness solo cuando existe dirección real cargada por el administrador. */
export function localBusinessLd(b: BusinessInfo, areas: string[]) {
  if (!b.address) return null;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: b.name,
    url: siteUrl(),
    image: `${siteUrl()}/icons/icon-512.png`,
    address: { "@type": "PostalAddress", streetAddress: b.address, addressCountry: "CO" },
    ...(b.phone ? { telephone: b.phone } : {}),
    areaServed: areas.map((a) => ({ "@type": "City", name: a })),
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${siteUrl()}${it.path}` })),
  };
}

export function faqLd(qa: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })),
  };
}
