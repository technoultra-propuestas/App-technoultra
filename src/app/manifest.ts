import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "TechnoUltra",
    short_name: "TechnoUltra",
    description: "Servicio técnico, tienda y proyectos digitales: sigue cada paso desde tu celular.",
    lang: "es-CO",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F6F5",
    theme_color: "#121212",
    categories: ["business", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Solicitar servicio", url: "/c/solicitar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Mis servicios", url: "/c/tickets", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
