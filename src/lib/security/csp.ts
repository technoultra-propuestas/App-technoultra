/**
 * Content-Security-Policy con nonce por petición. Sin 'unsafe-eval' en producción (solo en desarrollo, que React
 * lo necesita para reconstruir stacks). Los estilos en línea de atributos (style="...") se permiten vía style-src-attr
 * porque React/Next los emiten; no ejecutan código.
 */
export function buildCsp(nonce: string, opts: { isDev: boolean; supabaseUrl: string }): string {
  const supabaseHost = new URL(opts.supabaseUrl).host;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(opts.isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", `'nonce-${nonce}'`],
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://res.cloudinary.com",
      "https://api.cloudinary.com",
      "https://lh3.googleusercontent.com",
    ],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      `https://${supabaseHost}`,
      `wss://${supabaseHost}`,
      "https://api.cloudinary.com",
      ...(opts.isDev ? ["ws://localhost:*", "http://localhost:*"] : []),
    ],
    "media-src": ["'self'", "blob:", "https://res.cloudinary.com"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!opts.isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function newNonce(): string {
  return btoa(crypto.randomUUID());
}
