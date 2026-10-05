import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const supabase = {
  auth: {
    exchangeCodeForSession: vi.fn(),
    getUser: vi.fn(),
    signOut: vi.fn(),
    signInWithOAuth: vi.fn(),
    getClaims: vi.fn(),
  },
  from: vi.fn(),
};
const profileQuery = (result: { data: unknown; error: unknown }) => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => result }) }),
});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("@/lib/env.public", () => ({ getPublicEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.technoultra.com" }) }));
vi.mock("@/lib/auth/rate-limit", () => ({ allow: vi.fn(async () => true), clientIp: async () => "1.2.3.4" }));

import { GET as callback } from "@/app/auth/callback/route";
import { GET as startGoogle } from "@/app/auth/google/route";
import { allow } from "@/lib/auth/rate-limit";

const req = (path: string, headers?: Record<string, string>) => new NextRequest(new URL(path, "https://app.technoultra.com"), { headers });
const loc = (r: Response) => r.headers.get("location");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  supabase.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  supabase.auth.signOut.mockResolvedValue({});
  supabase.auth.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "oauth" }] } } });
  supabase.from.mockReturnValue(profileQuery({ data: { id: "u1", is_active: true, role: "client" }, error: null }));
});

describe("GET /auth/callback", () => {
  it("canjea el código y redirige al destino interno validado", async () => {
    const r = await callback(req("/auth/callback?code=abc", { cookie: "tu_next=/c/tickets" }));
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(loc(r)).toBe("https://app.technoultra.com/c/tickets");
  });
  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "/%0d%0aX"])("no permite open redirect con next=%s", async (n) => {
    const r = await callback(req(`/auth/callback?code=abc&next=${encodeURIComponent(n)}`));
    expect(loc(r)).toBe("https://app.technoultra.com/");
  });
  it("la cancelación del consentimiento muestra un aviso específico y no canjea nada", async () => {
    const r = await callback(req("/auth/callback?error=access_denied&error_description=<script>alert(1)</script>"));
    expect(loc(r)).toBe("https://app.technoultra.com/login?error=cancelled");
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(loc(r)).not.toContain("script");
  });
  it("otros errores del proveedor o configuración → error genérico (no se refleja el texto recibido)", async () => {
    const r = await callback(req("/auth/callback?error=server_error&error_code=unexpected_failure&error_description=Secret%20leak"));
    expect(loc(r)).toBe("https://app.technoultra.com/login?error=oauth");
  });
  it("callback sin código o con código absurdo → error", async () => {
    expect(loc(await callback(req("/auth/callback")))).toContain("error=oauth");
    expect(loc(await callback(req("/auth/callback?code=" + "a".repeat(3000))))).toContain("error=oauth");
  });
  it("enlace de correo vencido, ya usado o de otro dispositivo → aviso de enlace y no hay sesión", async () => {
    supabase.auth.exchangeCodeForSession.mockResolvedValue({ error: { status: 400, code: "flow_state_not_found" } });
    const r = await callback(req("/auth/callback?code=expirado"));
    expect(loc(r)).toBe("https://app.technoultra.com/login?error=link");
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it("código de Google inválido (hay cookie de destino) → error de Google", async () => {
    supabase.auth.exchangeCodeForSession.mockResolvedValue({ error: { status: 400, code: "flow_state_not_found" } });
    const r = await callback(req("/auth/callback?code=expirado", { cookie: "tu_next=/" }));
    expect(loc(r)).toBe("https://app.technoultra.com/login?error=oauth");
  });
  it("Supabase informa otp_expired (enlace vencido/usado) → aviso de enlace", async () => {
    const r = await callback(req("/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"));
    expect(loc(r)).toBe("https://app.technoultra.com/login?error=link");
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it.each(["admin", "technician"])("el personal (%s) NO puede entrar por Google/enlace: se cierra la sesión", async (role) => {
    supabase.from.mockReturnValue(profileQuery({ data: { id: "u1", is_active: true, role }, error: null }));
    const r = await callback(req("/auth/callback?code=abc&next=/b"));
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(loc(r)).toBe("https://app.technoultra.com/login?error=staff");
  });
  it("personal que llega por enlace de recuperación (cookie de gestión + sesión de correo) → solo a /gestion/restablecer", async () => {
    supabase.from.mockReturnValue(profileQuery({ data: { id: "u1", is_active: true, role: "admin" }, error: null }));
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "otp" }] } } });
    const r = await callback(req("/auth/callback?code=abc", { cookie: "tu_next=/gestion/restablecer" }));
    expect(loc(r)).toBe("https://app.technoultra.com/gestion/restablecer");
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });
  it.each([
    ["Google con cookie de gestión", [{ method: "oauth" }], "tu_next=/gestion/restablecer"],
    ["enlace de correo SIN cookie de gestión", [{ method: "otp" }], "tu_next=/b"],
    ["sesión de contraseña con cookie de gestión", [{ method: "password" }], "tu_next=/gestion/restablecer"],
  ])("el personal NO entra por el callback: %s", async (_n, amr, cookie) => {
    supabase.from.mockReturnValue(profileQuery({ data: { id: "u1", is_active: true, role: "admin" }, error: null }));
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { amr } } });
    const r = await callback(req("/auth/callback?code=abc", { cookie }));
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(loc(r)).toBe("https://app.technoultra.com/login?error=staff");
  });
  it("un cliente con la cookie de recuperación de gestión es llevado a su inicio, no a /gestion", async () => {
    const r = await callback(req("/auth/callback?code=abc", { cookie: "tu_next=/gestion/restablecer" }));
    expect(loc(r)).toBe("https://app.technoultra.com/");
  });
  it("usuario autenticado SIN perfil → se cierra la sesión", async () => {
    supabase.from.mockReturnValue(profileQuery({ data: null, error: null }));
    const r = await callback(req("/auth/callback?code=abc"));
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(loc(r)).toBe("https://app.technoultra.com/login?error=profile");
  });
  it("error al leer el perfil → se cierra la sesión", async () => {
    supabase.from.mockReturnValue(profileQuery({ data: null, error: { code: "PGRST000" } }));
    const r = await callback(req("/auth/callback?code=abc"));
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(loc(r)).toContain("error=profile");
  });
  it("perfil desactivado → se cierra la sesión", async () => {
    supabase.from.mockReturnValue(profileQuery({ data: { id: "u1", is_active: false, role: "client" }, error: null }));
    const r = await callback(req("/auth/callback?code=abc"));
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(loc(r)).toBe("https://app.technoultra.com/login?error=inactive");
  });
  it("sin usuario tras el intercambio → error", async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect(loc(await callback(req("/auth/callback?code=abc")))).toContain("error=oauth");
  });
  it("el rol nunca se toma de parámetros: ?role=admin no tiene efecto", async () => {
    const r = await callback(req("/auth/callback?code=abc&role=admin&next=/b/usuarios"));
    expect(loc(r)).toBe("https://app.technoultra.com/b/usuarios"); // el acceso real lo decide requireRole en el layout
    expect(supabase.from).toHaveBeenCalledWith("profiles");
  });
});

describe("GET /auth/google", () => {
  it("inicia OAuth con Google y redirectTo en el dominio de la app", async () => {
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://agosikmonvjujxzokdlc.supabase.co/auth/v1/authorize?provider=google" }, error: null });
    const r = await startGoogle(req("/auth/google?next=/c/solicitar"));
    const arg = supabase.auth.signInWithOAuth.mock.calls[0][0];
    expect(arg.provider).toBe("google");
    expect(arg.options.redirectTo).toBe("https://app.technoultra.com/auth/callback");
    expect(r.cookies.get("tu_next")?.value).toBe("/c/solicitar");
    expect(loc(r)).toContain("supabase.co/auth/v1/authorize");
  });
  it("un next externo se descarta antes de construir redirectTo", async () => {
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://x.supabase.co/auth/v1/authorize" }, error: null });
    const r = await startGoogle(req("/auth/google?next=https://evil.com"));
    expect(supabase.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe("https://app.technoultra.com/auth/callback");
    expect(r.cookies.get("tu_next")?.value).toBe("/");
  });
  it.each(["/b", "/b/usuarios", "/gestion/mfa", "/gestion/restablecer"])("Google nunca apunta a gestión: next=%s → /", async (n) => {
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://x.supabase.co/auth/v1/authorize" }, error: null });
    const r = await startGoogle(req(`/auth/google?next=${encodeURIComponent(n)}`));
    expect(r.cookies.get("tu_next")?.value).toBe("/");
  });
  it("error de configuración del proveedor → /login?error=oauth", async () => {
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { status: 400, code: "provider_disabled" } });
    expect(loc(await startGoogle(req("/auth/google")))).toBe("https://app.technoultra.com/login?error=oauth");
  });
  it("aplica límite de intentos", async () => {
    vi.mocked(allow).mockResolvedValueOnce(false);
    const r = await startGoogle(req("/auth/google"));
    expect(loc(r)).toBe("https://app.technoultra.com/login?error=rate");
    expect(supabase.auth.signInWithOAuth).not.toHaveBeenCalled();
  });
});
