import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { connection } from "next/server";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
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
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
