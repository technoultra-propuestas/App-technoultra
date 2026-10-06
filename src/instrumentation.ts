import type { Instrumentation } from "next";

/** Errores del servidor (render, rutas, acciones, proxy) → registro depurado y, si hay SENTRY_DSN, Sentry. Ver `lib/observability.ts`. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportServerError } = await import("@/lib/observability");
  await reportServerError(err, { path: request.path, method: request.method }, { routePath: context.routePath, routeType: context.routeType });
};
