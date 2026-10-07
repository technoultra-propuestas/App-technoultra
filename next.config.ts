import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Cámara solo desde nuestro propio origen (evidencias); sin micrófono/geolocalización por defecto.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(self)" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // El manifiesto es público y casi estático: se cachea una hora (y se sirve vencido hasta 1 día mientras se revalida) para no repetir la petición en cada carga.
      { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }] },
      // El service worker nunca se cachea para que las actualizaciones lleguen y se controlen desde la app.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

// Sentry: errores y trazas del servidor y del navegador. Los source maps se suben solo si hay SENTRY_AUTH_TOKEN (variable de build en Vercel, nunca en el cliente)
// y se eliminan del despliegue después de subirlos. Sin token, el build funciona igual (sin subida).
export default withSentryConfig(nextConfig, {
  org: "technoultra",
  project: "javascript-nextjs",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
