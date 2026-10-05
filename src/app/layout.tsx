import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "TechnoUltra", template: "%s · TechnoUltra" },
  description:
    "Servicio técnico de computadores e impresoras en Cali, Palmira, Jamundí y Yumbo, y soporte remoto en toda Colombia.",
  applicationName: "TechnoUltra",
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
      <body>{children}</body>
    </html>
  );
}
