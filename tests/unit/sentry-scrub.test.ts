import { describe, expect, it } from "vitest";
import { scrubSentryEvent, sentryCommon } from "@/lib/sentry-scrub";

describe("depuración de eventos del SDK de Sentry", () => {
  const dirty = () => ({
    message: "Falló para ana@correo.com con token=abcdef1234567890 y 3183943465",
    user: { id: "u-1", email: "ana@correo.com", ip_address: "1.2.3.4" },
    server_name: "host-interno",
    extra: { secreto: "x" },
    transaction: "/c/tickets/3f2b8c1e-9d4a-4c1e-8f7a-1b2c3d4e5f60",
    request: { url: "https://app.technoultra.com/c/tickets/3f2b8c1e-9d4a-4c1e-8f7a-1b2c3d4e5f60?token=abc", headers: { cookie: "sb=1", authorization: "Bearer x" }, cookies: { sb: "1" }, data: { password: "p" }, query_string: "token=abc" },
    exception: { values: [{ value: "JWT eyJhbGciOiJIUzI1NiIsInR5cCI6.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop falló", stacktrace: { frames: [{ vars: { clave: "x" } }] } }] },
    breadcrumbs: [
      { category: "console", message: "dato personal" },
      { category: "fetch", message: "POST", data: { url: "https://x.co/api/a/3f2b8c1e-9d4a-4c1e-8f7a-1b2c3d4e5f60?q=1", body: "secreto", headers: "h" } },
    ],
    spans: [{ description: "GET /api/ana@correo.com", data: { a: 1 } }],
  });
  it("elimina usuario, IP, cookies, cabeceras, cuerpos, query, variables locales y datos extra", () => {
    const e = scrubSentryEvent(dirty());
    expect(e.user).toBeUndefined();
    expect(e.extra).toBeUndefined();
    expect(e.server_name).toBeUndefined();
    expect(e.request).toEqual({ url: "/c/tickets/:id" });
    expect(e.exception?.values?.[0].stacktrace?.frames?.[0].vars).toBeUndefined();
  });
  it("depura textos: correos, tokens, JWT, números largos e identificadores", () => {
    const e = scrubSentryEvent(dirty());
    const all = JSON.stringify(e);
    for (const leak of ["ana@correo.com", "abcdef1234567890", "3183943465", "eyJhbGci", "3f2b8c1e", "Bearer x", "host-interno"]) expect(all).not.toContain(leak);
    expect(e.transaction).toBe("/c/tickets/:id");
  });
  it("descarta migas de consola y oculta cuerpos/cabeceras de las demás", () => {
    const e = scrubSentryEvent(dirty());
    expect(e.breadcrumbs).toHaveLength(1);
    expect(e.breadcrumbs?.[0].data).toMatchObject({ body: "[oculto]", headers: "[oculto]" });
    expect(e.spans?.[0].data).toBeUndefined();
  });
  it("sin DSN el SDK queda deshabilitado; nunca envía datos personales por defecto", () => {
    expect(sentryCommon(undefined)).toMatchObject({ enabled: false, sendDefaultPii: false });
    expect(sentryCommon("https://k@o1.ingest.us.sentry.io/2")).toMatchObject({ enabled: true, sendDefaultPii: false });
  });
});
