/**
 * Observabilidad de errores del servidor, sin dependencias y sin datos personales.
 *  - Siempre escribe un registro estructurado (JSON) que Vercel conserva y se puede buscar por `digest`.
 *  - Si existe `SENTRY_DSN`, además envía el evento a Sentry por su API de «envelope» (sin SDK).
 * Nunca se envían cabeceras, cookies, cuerpos de petición, parámetros de URL ni identificadores de personas:
 * el mensaje se depura (correos, JWT, claves, números largos) y la ruta se normaliza (UUID → :id, sin query).
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const SECRET_KV = /\b(password|passwd|token|secret|apikey|api_key|authorization|signature|access_token|refresh_token)\b\s*[:=]\s*["']?[^\s"',;]+/gi;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const LONG_DIGITS = /\b\d{6,}\b/g;

/** Quita de un texto libre todo lo que pueda identificar a una persona o dar acceso. */
export function scrubText(input: unknown, max = 300): string {
  const s = typeof input === "string" ? input : input instanceof Error ? input.message : String(input ?? "");
  return s
    .replace(JWT, "[jwt]")
    .replace(BEARER, "$1 [token]")
    .replace(SECRET_KV, "$1=[oculto]")
    .replace(EMAIL, "[correo]")
    .replace(UUID, "[id]")
    .replace(LONG_TOKEN, "[token]")
    .replace(LONG_DIGITS, "[n]")
    .slice(0, max);
}

/** Ruta sin query ni identificadores: `/c/tickets/<uuid>?pago=ok` → `/c/tickets/:id`. */
export function scrubPath(path: unknown): string {
  const p = String(path ?? "").split("?")[0].split("#")[0];
  return p.replace(UUID, ":id").replace(/\/\d{4,}(?=\/|$)/g, "/:n").slice(0, 200);
}

export type ErrorReport = {
  event: "server_error";
  name: string;
  message: string;
  digest?: string;
  route: string;
  routeType: string;
  method: string;
  environment: string;
  release?: string;
};

type Env = Record<string, string | undefined>;
type RequestInfo = { path?: string; method?: string };
type ErrorContext = { routePath?: string; routeType?: string };

/** Construye el reporte depurado a partir de lo que entrega `onRequestError` (las cabeceras se descartan a propósito). */
export function buildReport(err: unknown, request: RequestInfo, context: ErrorContext, env: Env = process.env): ErrorReport {
  const digest = typeof err === "object" && err !== null && "digest" in err ? scrubText((err as { digest: unknown }).digest, 40) : undefined;
  return {
    event: "server_error",
    name: err instanceof Error ? scrubText(err.name, 60) : "NonError",
    message: scrubText(err),
    digest,
    route: scrubPath(context.routePath || request.path),
    routeType: scrubText(context.routeType ?? "unknown", 30),
    method: scrubText(request.method ?? "GET", 10).toUpperCase(),
    environment: env.VERCEL_ENV ?? env.NODE_ENV ?? "unknown",
    release: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
  };
}

/** `https://<clave>@<host>/<proyecto>` → URL de «envelope» y clave pública. Devuelve null si el DSN no es válido. */
export function parseDsn(dsn: string | undefined): { url: string; key: string; project: string } | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+/, "");
    if (!u.username || !/^\d+$/.test(project) || u.protocol !== "https:") return null;
    return { url: `https://${u.host}/api/${project}/envelope/?sentry_key=${encodeURIComponent(u.username)}&sentry_version=7`, key: u.username, project };
  } catch {
    return null;
  }
}

/** Cuerpo «envelope» de Sentry con un único evento de error (sin usuario, sin petición, sin cabeceras). */
export function buildEnvelope(report: ErrorReport, eventId: string, now = new Date()): string {
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "node",
    level: "error",
    environment: report.environment,
    release: report.release,
    logger: "technoultra.server",
    message: `${report.name}: ${report.message}`,
    tags: { route: report.route, route_type: report.routeType, method: report.method, digest: report.digest ?? "none" },
    fingerprint: [report.name, report.route, report.digest ?? report.message.slice(0, 60)],
  };
  return [JSON.stringify({ event_id: eventId, sent_at: now.toISOString() }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
}

/** Registra el error (siempre) y lo envía a Sentry (solo si hay DSN). Nunca lanza: observar no debe romper la petición. */
export async function reportServerError(err: unknown, request: RequestInfo, context: ErrorContext, env: Env = process.env, send: typeof fetch = fetch): Promise<void> {
  try {
    const report = buildReport(err, request, context, env);
    console.error(JSON.stringify(report));
    const dsn = parseDsn(env.SENTRY_DSN);
    if (!dsn) return;
    const eventId = crypto.randomUUID().replace(/-/g, "");
    await send(dsn.url, { method: "POST", headers: { "Content-Type": "application/x-sentry-envelope" }, body: buildEnvelope(report, eventId), signal: AbortSignal.timeout(3000) });
  } catch {
    /* sin acción: la observabilidad es de mejor esfuerzo */
  }
}
