import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/servicios", "/cobertura", "/soporte-remoto", "/legal"], disallow: ["/c/", "/b/", "/api/", "/auth/", "/onboarding", "/avisos", "/documentos/", "/seguimiento", "/login", "/registro", "/equipo", "/recuperar", "/verificar", "/restablecer"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
