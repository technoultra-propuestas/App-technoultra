import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
