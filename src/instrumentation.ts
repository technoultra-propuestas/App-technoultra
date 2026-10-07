import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

/**
 * Errores del servidor (render, rutas, acciones, proxy): registro depurado con digest (Vercel) + Sentry (SDK; todo pasa por `scrubSentryEvent`).
 * El reportero propio ya no envía a Sentry aquí (evita duplicados): solo deja el registro estructurado.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  Sentry.captureRequestError(err, request, context);
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportServerError } = await import("@/lib/observability");
  await reportServerError(err, { path: request.path, method: request.method }, { routePath: context.routePath, routeType: context.routeType }, { ...process.env, SENTRY_DSN: undefined });
};
