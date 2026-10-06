import { describe, expect, it, vi } from "vitest";
import { buildEnvelope, buildReport, parseDsn, reportServerError, scrubPath, scrubText } from "@/lib/observability";

describe("depuración de datos (sin datos personales ni secretos)", () => {
  it("quita correos, JWT, claves, identificadores y números largos del mensaje", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const out = scrubText(`fallo para ana.perez@gmail.com id 3f2b8c1e-9d4a-4c1e-8f7a-1b2c3d4e5f60 cel 3183943465 Authorization: Bearer abcdef123456 password=Hunter2 ${jwt}`);
    expect(out).not.toMatch(/ana\.perez|gmail|3f2b8c1e|3183943465|Hunter2|abcdef123456|eyJ/);
    expect(out).toContain("[correo]");
    expect(out).toContain("[id]");
  });
  it("normaliza rutas: sin query ni identificadores", () => {
    expect(scrubPath("/c/tickets/3f2b8c1e-9d4a-4c1e-8f7a-1b2c3d4e5f60?pago=ok&email=a@b.co")).toBe("/c/tickets/:id");
    expect(scrubPath("/b/pedidos/123456")).toBe("/b/pedidos/:n");
    expect(scrubPath(undefined)).toBe("");
  });
  it("el reporte no incluye cabeceras ni cookies aunque la petición las traiga", () => {
    const req = { path: "/c/perfil?token=zzz", method: "post", headers: { cookie: "sb=secreto", authorization: "Bearer xyz" } };
    const r = buildReport(Object.assign(new Error("boom 9988776"), { digest: "abc123" }), req, { routePath: "/c/perfil", routeType: "action" }, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "0123456789abcdef" });
    expect(JSON.stringify(r)).not.toMatch(/secreto|xyz|zzz|cookie|authorization|9988776/);
    expect(r).toMatchObject({ route: "/c/perfil", routeType: "action", method: "POST", digest: "abc123", environment: "production", release: "0123456789ab" });
  });
});

describe("Sentry opcional", () => {
  it("valida el DSN: solo https con clave y proyecto numérico", () => {
    expect(parseDsn("https://abc123@o1.ingest.sentry.io/4500")?.url).toBe("https://o1.ingest.sentry.io/api/4500/envelope/?sentry_key=abc123&sentry_version=7");
    for (const bad of [undefined, "", "http://abc@host/1", "https://host/1", "https://abc@host/proyecto", "no-es-url"]) expect(parseDsn(bad)).toBeNull();
  });
  it("el sobre contiene un único evento sin usuario ni petición", () => {
    const env = buildEnvelope(buildReport(new Error("x"), { path: "/b", method: "GET" }, { routePath: "/b", routeType: "render" }, {}), "e".repeat(32), new Date("2026-10-05T00:00:00Z"));
    const [head, item, event] = env.split("\n").map((l) => JSON.parse(l));
    expect(head.event_id).toHaveLength(32);
    expect(item).toEqual({ type: "event" });
    expect(event).not.toHaveProperty("user");
    expect(event).not.toHaveProperty("request");
    expect(event.tags.route).toBe("/b");
  });
  it("sin DSN solo registra; con DSN envía una vez; un fallo de red no rompe nada", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn(async () => new Response("ok"));
    await reportServerError(new Error("a"), { path: "/x" }, {}, {}, send as unknown as typeof fetch);
    expect(send).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    await reportServerError(new Error("a"), { path: "/x" }, {}, { SENTRY_DSN: "https://k@o1.ingest.sentry.io/1" }, send as unknown as typeof fetch);
    expect(send).toHaveBeenCalledTimes(1);
    const failing = vi.fn(async () => {
      throw new Error("red caída");
    });
    await expect(reportServerError(new Error("a"), {}, {}, { SENTRY_DSN: "https://k@o1.ingest.sentry.io/1" }, failing as unknown as typeof fetch)).resolves.toBeUndefined();
    log.mockRestore();
  });
});
