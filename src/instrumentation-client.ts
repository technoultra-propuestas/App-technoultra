import * as Sentry from "@sentry/nextjs";
import { sentryCommon } from "@/lib/sentry-scrub";

// Navegador: solo errores y trazas. SIN Session Replay ni formulario de comentarios (datos de clientes); sin PII por defecto.
// El DSN es una clave de ENVÍO pública por diseño (no da acceso de lectura); por eso puede ir en NEXT_PUBLIC_*.
Sentry.init({ ...sentryCommon(process.env.NEXT_PUBLIC_SENTRY_DSN), ignoreErrors: ["ResizeObserver loop limit exceeded", "ResizeObserver loop completed with undelivered notifications."] });

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
