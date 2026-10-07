import { scrubPath, scrubText } from "@/lib/observability";

/**
 * Depuración de TODO lo que el SDK de Sentry envía (cliente, servidor y edge). Zero Trust / Ley 1581: sin cookies, cabeceras, cuerpos,
 * parámetros de URL, IP ni identificadores de personas; los textos pasan por `scrubText` (correos, JWT, claves, números largos).
 * Tipado estructural mínimo a propósito: no depende de los tipos internos del SDK.
 */
type Frame = { vars?: unknown };
type EventLike = {
  message?: string;
  user?: unknown;
  request?: { url?: string; headers?: unknown; cookies?: unknown; data?: unknown; query_string?: unknown; env?: unknown };
  exception?: { values?: { value?: string; stacktrace?: { frames?: Frame[] } }[] };
  breadcrumbs?: { message?: string; data?: Record<string, unknown>; category?: string; type?: string }[];
  transaction?: string;
  contexts?: Record<string, unknown>;
  extra?: unknown;
  server_name?: string;
  spans?: { description?: string; data?: unknown }[];
};

const stripUrl = (u: string | undefined) => (u ? scrubPath(u.replace(/^https?:\/\/[^/]+/, "")) : u);

export function scrubSentryEvent<T extends EventLike>(event: T): T {
  delete event.user;
  delete event.extra;
  delete event.server_name;
  if (event.message) event.message = scrubText(event.message, 500);
  if (event.transaction) event.transaction = scrubPath(event.transaction);
  if (event.request) {
    event.request = { url: stripUrl(event.request.url) };
  }
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value, 500);
    for (const f of ex.stacktrace?.frames ?? []) delete f.vars;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .filter((b) => b.category !== "console" && b.category !== "ui.input")
      .map((b) => ({
        ...b,
        message: b.message ? scrubText(b.message, 200) : b.message,
        data: b.data ? Object.fromEntries(Object.entries(b.data).map(([k, v]) => [k, typeof v === "string" && /url|to|from/i.test(k) ? stripUrl(v) : /body|headers|cookie|token|auth/i.test(k) ? "[oculto]" : v])) : b.data,
      }));
  }
  for (const s of event.spans ?? []) {
    if (s.description) s.description = scrubText(s.description, 200);
    delete s.data;
  }
  return event;
}

/** Opciones comunes a los tres entornos del SDK. */
export const sentryCommon = (dsn: string | undefined) => ({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  release: (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA)?.slice(0, 12),
  sendDefaultPii: false,
  // 10 % de trazas en producción; 100 % solo en desarrollo.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  beforeSend: <E>(event: E): E => scrubSentryEvent(event as unknown as EventLike) as unknown as E,
  beforeSendTransaction: <E>(event: E): E => scrubSentryEvent(event as unknown as EventLike) as unknown as E,
});
