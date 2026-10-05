import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  user: { id: "u1" } as { id: string } | null,
  profile: { id: "u1", role: "admin", email: "admin@technoultra.com", full_name: "Admin", is_active: true } as Record<string, unknown> | null,
  claims: { aal: "aal2", amr: [{ method: "totp" }, { method: "password" }] } as Record<string, unknown> | null,
};
const supabase = {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: state.user }, error: null })),
    getClaims: vi.fn(async () => ({ data: state.claims ? { claims: state.claims } : null })),
    updateUser: vi.fn(),
    signOut: vi.fn(),
    mfa: { listFactors: vi.fn(), challengeAndVerify: vi.fn() },
  },
  from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile }) }) }) })),
  rpc: vi.fn(async () => ({ error: null })),
};
const probe = { auth: { signInWithPassword: vi.fn(), signOut: vi.fn() } };
const allow = vi.fn(async () => true);

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => probe }));
vi.mock("@/lib/env.public", () => ({ getPublicEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.technoultra.com", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-de-prueba-1234567890" }) }));
vi.mock("@/lib/auth/rate-limit", () => ({ allow: (...a: unknown[]) => allow(...(a as [])), clientIp: async () => "1.2.3.4", TOO_MANY: "Demasiados intentos." }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("react", async (orig) => ({ ...((await orig()) as object), cache: <T,>(fn: T) => fn }));

import { changePasswordAction } from "@/app/b/seguridad/actions";
import { initialState } from "@/lib/auth/schemas";
import { assertRole, AuthorizationError, requireRole } from "@/lib/auth/session";
import { isStaffArea, loginPathFor } from "@/lib/auth/routes";

const FACTOR = "22222222-2222-4222-8222-222222222222";
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const good = { current: "Clave-actual-1", password: "Clave-nueva-2026", confirm: "Clave-nueva-2026", code: "123456" };
const events = () => supabase.rpc.mock.calls.map((c) => (c as unknown as [string, { p_event: string }])[1].p_event);

beforeEach(() => {
  vi.clearAllMocks();
  allow.mockResolvedValue(true);
  state.user = { id: "u1" };
  state.profile = { id: "u1", role: "admin", email: "admin@technoultra.com", full_name: "Admin", is_active: true };
  state.claims = { aal: "aal2", amr: [{ method: "totp" }, { method: "password" }] };
  supabase.auth.mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: FACTOR, status: "verified" }] } });
  supabase.auth.mfa.challengeAndVerify.mockResolvedValue({ error: null });
  supabase.auth.updateUser.mockResolvedValue({ error: null });
  supabase.auth.signOut.mockResolvedValue({});
  probe.auth.signInWithPassword.mockResolvedValue({ error: null });
  probe.auth.signOut.mockResolvedValue({});
});

describe("cambio de contraseña del personal (reautenticación)", () => {
  it("flujo completo: TOTP, contraseña actual, cambio en Supabase, revocación de otras sesiones y auditoría", async () => {
    const r = await changePasswordAction(initialState, fd(good));
    expect(r.ok).toBe(true);
    expect(supabase.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: FACTOR, code: "123456" });
    expect(probe.auth.signInWithPassword).toHaveBeenCalledWith({ email: "admin@technoultra.com", password: "Clave-actual-1" });
    expect(probe.auth.signOut).toHaveBeenCalledWith({ scope: "local" }); // solo la sesión de verificación
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "Clave-nueva-2026" });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(events()).toEqual(["staff.password_changed", "staff.session_revoked"]);
  });
  it("código TOTP incorrecto → no verifica la contraseña, no cambia nada y audita el fallo", async () => {
    supabase.auth.mfa.challengeAndVerify.mockResolvedValue({ error: { code: "mfa_verification_failed" } });
    const r = await changePasswordAction(initialState, fd(good));
    expect(r.fieldErrors?.code).toBeTruthy();
    expect(probe.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    expect(events()).toEqual(["staff.mfa_failure"]);
  });
  it("contraseña actual incorrecta → no cambia nada", async () => {
    probe.auth.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials" } });
    const r = await changePasswordAction(initialState, fd(good));
    expect(r.fieldErrors?.current).toBeTruthy();
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });
  it("sin autenticador configurado no se permite", async () => {
    supabase.auth.mfa.listFactors.mockResolvedValue({ data: { totp: [] } });
    expect((await changePasswordAction(initialState, fd(good))).ok).toBe(false);
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });
  it("valida: nueva ≠ actual, política y confirmación; y limita intentos", async () => {
    expect((await changePasswordAction(initialState, fd({ ...good, password: good.current, confirm: good.current }))).fieldErrors?.password).toBeTruthy();
    expect((await changePasswordAction(initialState, fd({ ...good, password: "corta", confirm: "corta" }))).fieldErrors?.password).toBeTruthy();
    expect((await changePasswordAction(initialState, fd({ ...good, confirm: "Otra-2026-xx" }))).fieldErrors?.confirm).toBeTruthy();
    allow.mockResolvedValue(false);
    expect((await changePasswordAction(initialState, fd(good))).error).toBe("Demasiados intentos.");
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });
  it("si la sesión es aal1 (sin MFA) la acción ni siquiera arranca", async () => {
    state.claims = { aal: "aal1", amr: [{ method: "password" }] };
    await expect(changePasswordAction(initialState, fd(good))).rejects.toBeInstanceOf(AuthorizationError);
    expect(supabase.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });
  it("un cliente no puede usarla", async () => {
    state.profile = { ...state.profile, role: "client" };
    await expect(changePasswordAction(initialState, fd(good))).rejects.toMatchObject({ status: 403 });
  });
});

describe("autorización: el personal exige MFA (aal2) en el servidor", () => {
  it("assertRole: técnico/admin con aal1 → 401; con aal2 → ok; cliente no necesita MFA", async () => {
    state.claims = { aal: "aal1", amr: [{ method: "password" }] };
    await expect(assertRole(["admin"])).rejects.toMatchObject({ status: 401 });
    state.profile = { ...state.profile, role: "technician" };
    await expect(assertRole(["technician", "admin"])).rejects.toMatchObject({ status: 401 });
    state.claims = { aal: "aal2", amr: [] };
    await expect(assertRole(["technician", "admin"])).resolves.toMatchObject({ role: "technician" });
    state.profile = { ...state.profile, role: "client" };
    state.claims = { aal: "aal1", amr: [] };
    await expect(assertRole(["client"])).resolves.toMatchObject({ role: "client" });
  });
  it("assertRole: rol incorrecto → 403 aunque tenga aal2; sin sesión o inactivo → 401", async () => {
    state.profile = { ...state.profile, role: "technician" };
    await expect(assertRole(["admin"])).rejects.toMatchObject({ status: 403 });
    state.profile = { ...state.profile, is_active: false };
    await expect(assertRole(["technician"])).rejects.toMatchObject({ status: 401 });
    state.user = null;
    await expect(assertRole(["technician"])).rejects.toMatchObject({ status: 401 });
  });
  it("un aal declarado fuera del JWT verificado no existe: sin claims se trata como aal1", async () => {
    state.claims = null;
    await expect(assertRole(["admin"])).rejects.toMatchObject({ status: 401 });
  });
  it("requireRole en páginas de gestión: sin sesión → /gestion/login; sin MFA → /gestion/mfa; cliente → /c", async () => {
    state.user = null;
    await expect(requireRole(["admin"])).rejects.toThrow("REDIRECT:/gestion/login");
    state.user = { id: "u1" };
    state.claims = { aal: "aal1", amr: [{ method: "password" }] };
    await expect(requireRole(["technician", "admin"])).rejects.toThrow("REDIRECT:/gestion/mfa");
    state.profile = { ...state.profile, role: "client" };
    await expect(requireRole(["technician", "admin"])).rejects.toThrow("REDIRECT:/c");
  });
  it("requireRole en páginas de cliente: sin sesión → /login; el personal es llevado a su panel", async () => {
    state.user = null;
    await expect(requireRole(["client"])).rejects.toThrow("REDIRECT:/login");
    state.user = { id: "u1" };
    await expect(requireRole(["client"])).rejects.toThrow("REDIRECT:/b");
  });
});

describe("separación de puertas por ruta", () => {
  it("/b y /gestion son zona de personal; el resto es de clientes", () => {
    for (const p of ["/b", "/b/tickets", "/gestion", "/gestion/login", "/gestion/mfa"]) expect(isStaffArea(p)).toBe(true);
    for (const p of ["/", "/c", "/c/tickets", "/login", "/onboarding", "/servicios", "/bonito", "/gestionar"]) expect(isStaffArea(p)).toBe(false);
    expect(loginPathFor("/b/usuarios")).toBe("/gestion/login");
    expect(loginPathFor("/gestion/mfa")).toBe("/gestion/login");
    expect(loginPathFor("/c/tickets")).toBe("/login");
    expect(loginPathFor("/onboarding")).toBe("/login");
  });
});
