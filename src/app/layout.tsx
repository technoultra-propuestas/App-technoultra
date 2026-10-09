import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import "./globals.css";

// Manrope AUTOALOJADA (licencia OFL, archivos en src/fonts, subconjunto latino = todo el español). Antes se descargaba de Google Fonts en cada
// build y Vercel falló dos veces por esa descarga; así el build no depende de ningún servicio externo. La tipografía es la misma.
const manrope = localFont({
  variable: "--font-manrope",
  display: "swap",
  src: [
    { path: "../fonts/manrope-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/manrope-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/manrope-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/manrope-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../fonts/manrope-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
});

const siteDescription = "Servicio técnico de computadores e impresoras en Cali, Palmira, Jamundí y Yumbo, y soporte remoto en toda Colombia. Tienda, garantías y proyectos digitales.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "TechnoUltra · Servicio técnico y soluciones digitales", template: "%s · TechnoUltra" },
  description: siteDescription,
  applicationName: "TechnoUltra",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "TechnoUltra",
    title: "TechnoUltra · Servicio técnico y soluciones digitales",
    description: siteDescription,
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "TechnoUltra" }],
  },
  twitter: { card: "summary", title: "TechnoUltra", description: siteDescription, images: ["/icons/icon-512.png"] },
  appleWebApp: { capable: true, title: "TechnoUltra", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#121212",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // CSP con nonce por petición ⇒ todas las rutas se renderizan en servidor (un HTML estático no puede llevar nonce).
  await connection();
  return (
    <html lang="es-CO" className={manrope.variable}>
      <body>
        <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-[12px] focus:bg-ink focus:px-4 focus:py-3 focus:font-extrabold focus:text-white">
          Saltar al contenido
        </a>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
