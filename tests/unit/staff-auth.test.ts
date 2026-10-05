import { beforeEach, describe, expect, it, vi } from "vitest";

const profileRow = { data: { role: "technician", is_active: true } as { role: string; is_active: boolean } | null };
const supabase = {
  auth: {
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    updateUser: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    mfa: { listFactors: vi.fn(), enroll: vi.fn(), unenroll: vi.fn(), challengeAndVerify: vi.fn() },
  },
  from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => profileRow }) }) })),
  rpc: vi.fn(async () => ({ error: null })),
};
const jar = { set: vi.fn() };
const allow = vi.fn(async () => true);
const session = {
  assertStaffSession: vi.fn(async () => ({ id: "u1", role: "technician", email: "t@technoultra.com", is_active: true, full_name: "Téc" })),
  getAal: vi.fn(async () => ({ aal: "aal1", amr: ["password"] })),
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("@/lib/env.public", () => ({ getPublicEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.technoultra.com" }) }));
vi.mock("@/lib/auth/rate-limit", () => ({ allow: (...a: unknown[]) => allow(...(a as [])), clientIp: async () => "1.2.3.4", TOO_MANY: "Demasiados intentos." }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...((await orig()) as object),
  assertStaffSession: () => session.assertStaffSession(),
  getAal: () => session.getAal(),
}));

import {
  staffRequestRecoveryAction,
  staffResetPasswordAction,
  staffSignInAction,
  startEnrollmentAction,
  verifyChallengeAction,
  verifyEnrollmentAction,
} from "@/app/gestion/actions";
import { initialState } from "@/lib/auth/schemas";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const events = () => supabase.rpc.mock.calls.map((c) => (c as unknown as [string, { p_event: string }])[1].p_event);
const FACTOR = "11111111-1111-4111-8111-111111111111";
const verifiedFactor = { totp: [{ id: FACTOR, status: "verified" }], all: [{ id: FACTOR, status: "verified", factor_type: "totp" }] };

beforeEach(() => {
  vi.clearAllMocks();
  allow.mockResolvedValue(true);
  profileRow.data = { role: "technician", is_active: true };
  supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  supabase.auth.signOut.mockResolvedValue({});
  supabase.auth.mfa.listFactors.mockResolvedValue({ data: { totp: [], all: [] } });
  supabase.auth.mfa.challengeAndVerify.mockResolvedValue({ error: null });
  supabase.auth.updateUser.mockResolvedValue({ error: null });
  supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  supabase.rpc.mockResolvedValue({ error: null });
  session.assertStaffSession.mockResolvedValue({ id: "u1", role: "technician", email: "t@technoultra.com", is_active: true, full_name: "Téc" });
  session.getAal.mockResolvedValue({ aal: "aal1", amr: ["password"] });
});

describe("login del personal (/gestion/login)", () => {
  it("credenciales incorrectas → mensaje genérico y sin auditoría", async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { code: "invalid_credentials" } });
    const r = await staffSignInAction(initialState, fd({ email: "t@technoultra.com", password: "x" }));
    expect(r).toEqual({ ok: false, error: "Correo o contraseña incorrectos." });
    expect(events()).toEqual([]);
  });
  it("un CLIENTE es rechazado: se cierra la sesión creada y no se audita como personal", async () => {
    profileRow.data = { role: "client", is_active: true };
    const r = await staffSignInAction(initialState, fd({ email: "c@gmail.com", password: "Clave-segura-1" }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/personal autorizado/);
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(events()).toEqual([]);
  });
  it("personal: audita staff.login y manda a verificar MFA (nunca directo al panel)", async () => {
    await expect(staffSignInAction(initialState, fd({ email: "t@technoultra.com", password: "Clave-segura-1" }))).rejects.toThrow("REDIRECT:/gestion/mfa");
    expect(events()).toEqual(["staff.login"]);
  });
  it("el destino posterior solo puede ser una ruta de gestión (sin open redirect)", async () => {
    await expect(staffSignInAction(initialState, fd({ email: "t@technoultra.com", password: "x", next: "https://evil.com" }))).rejects.toThrow("REDIRECT:/gestion/mfa");
    await expect(staffSignInAction(initialState, fd({ email: "t@technoultra.com", password: "x", next: "/c/tickets" }))).rejects.toThrow("REDIRECT:/gestion/mfa");
    await expect(staffSignInAction(initialState, fd({ email: "t@technoultra.com", password: "x", next: "/b/tickets" }))).rejects.toThrow(/REDIRECT:\/gestion\/mfa\?next=%2Fb%2Ftickets/);
  });
  it("respeta el límite de intentos", async () => {
    allow.mockResolvedValue(false);
    const r = await staffSignInAction(initialState, fd({ email: "t@technoultra.com", password: "x" }));
    expect(r.error).toBe("Demasiados intentos.");
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("cuenta desactivada → mensaje genérico y sesión cerrada", async () => {
    profileRow.data = { role: "technician", is_active: false };
    const r = await staffSignInAction(initialState, fd({ email: "t@technoultra.com", password: "Clave-segura-1" }));
    expect(r.error).toBe("Correo o contraseña incorrectos.");
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});

describe("inscripción y desafío MFA (TOTP de Supabase)", () => {
  it("devuelve QR y secreto solo en la respuesta y limpia inscripciones abandonadas", async () => {
    supabase.auth.mfa.listFactors.mockResolvedValue({ data: { totp: [], all: [{ id: "old", status: "unverified", factor_type: "totp" }] } });
    supabase.auth.mfa.enroll.mockResolvedValue({ data: { id: FACTOR, totp: { qr_code: "data:image/svg+xml;utf8,<svg/>", secret: "ABCDEFGH", uri: "otpauth://totp/x" } }, error: null });
    const r = await startEnrollmentAction(initialState, new FormData());
    expect(r.enroll).toMatchObject({ factorId: FACTOR, secret: "ABCDEFGH" });
    expect(supabase.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: "old" });
    expect(supabase.auth.mfa.enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: "totp" }));
  });
  it("con un autenticador ya verificado NO permite inscribir otro (evita añadir un segundo factor con aal1)", async () => {
    supabase.auth.mfa.listFactors.mockResolvedValue({ data: verifiedFactor });
    const r = await startEnrollmentAction(initialState, new FormData());
    expect(r.ok).toBe(false);
    expect(supabase.auth.mfa.enroll).not.toHaveBeenCalled();
  });
  it("código de inscripción incorrecto → audita el fallo y no activa", async () => {
    supabase.auth.mfa.challengeAndVerify.mockResolvedValue({ error: { code: "mfa_verification_failed" } });
    const r = await verifyEnrollmentAction(initialState, fd({ factorId: FACTOR, code: "123456" }));
    expect(r.ok).toBe(false);
    expect(events()).toEqual(["staff.mfa_failure"]);
  });
  it("código de inscripción correcto → audita enroll+success y entra al panel", async () => {
    await expect(verifyEnrollmentAction(initialState, fd({ factorId: FACTOR, code: "123456" }))).rejects.toThrow("REDIRECT:/b");
    expect(events()).toEqual(["staff.mfa_enroll", "staff.mfa_success"]);
  });
  it("rechaza códigos mal formados antes de llamar a Supabase", async () => {
    for (const code of ["12345", "abcdef", "1234567", ""]) {
      const r = await verifyEnrollmentAction(initialState, fd({ factorId: FACTOR, code }));
      expect(r.ok).toBe(false);
    }
    expect(supabase.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });
  it("desafío: sin factor → vuelve a configurar; código malo → fallo auditado; bueno → panel", async () => {
    await expect(verifyChallengeAction(initialState, fd({ code: "123456" }))).rejects.toThrow("REDIRECT:/gestion/mfa");
    supabase.auth.mfa.listFactors.mockResolvedValue({ data: verifiedFactor });
    supabase.auth.mfa.challengeAndVerify.mockResolvedValueOnce({ error: { code: "mfa_verification_failed" } });
    expect((await verifyChallengeAction(initialState, fd({ code: "000000" }))).ok).toBe(false);
    expect(events()).toEqual(["staff.mfa_failure"]);
    await expect(verifyChallengeAction(initialState, fd({ code: "123456" }))).rejects.toThrow("REDIRECT:/b");
    expect(events()).toEqual(["staff.mfa_failure", "staff.mfa_success"]);
  });
  it("el desafío limita intentos (fuerza bruta de 6 dígitos)", async () => {
    allow.mockResolvedValue(false);
    expect((await verifyChallengeAction(initialState, fd({ code: "123456" }))).error).toBe("Demasiados intentos.");
    expect(supabase.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });
  it("tras el desafío solo se admite volver a /gestion/restablecer o a rutas /b", async () => {
    supabase.auth.mfa.listFactors.mockResolvedValue({ data: verifiedFactor });
    await expect(verifyChallengeAction(initialState, fd({ code: "123456", next: "/gestion/restablecer" }))).rejects.toThrow("REDIRECT:/gestion/restablecer");
    await expect(verifyChallengeAction(initialState, fd({ code: "123456", next: "https://evil.com" }))).rejects.toThrow("REDIRECT:/b");
  });
});

describe("recuperación de contraseña del personal", () => {
  it("usa el callback exacto, guarda el destino en cookie y responde igual exista o no la cuenta", async () => {
    await expect(staffRequestRecoveryAction(initialState, fd({ email: "x@y.co" }))).rejects.toThrow("REDIRECT:/gestion/recuperar?enviado=1");
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("x@y.co", { redirectTo: "https://app.technoultra.com/auth/callback" });
    expect(jar.set).toHaveBeenCalledWith("tu_next", "/gestion/restablecer", expect.objectContaining({ httpOnly: true, path: "/auth" }));
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: { status: 400, code: "user_not_found" } });
    await expect(staffRequestRecoveryAction(initialState, fd({ email: "nadie@y.co" }))).rejects.toThrow("REDIRECT:/gestion/recuperar?enviado=1");
  });
  it("limita las solicitudes", async () => {
    allow.mockResolvedValue(false);
    expect((await staffRequestRecoveryAction(initialState, fd({ email: "x@y.co" }))).error).toBe("Demasiados intentos.");
    expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("establecer contraseña: una sesión normal (contraseña) NO sirve; hace falta venir del enlace del correo", async () => {
    const r = await staffResetPasswordAction(initialState, fd({ password: "Nueva-clave-2026", confirm: "Nueva-clave-2026" }));
    expect(r.ok).toBe(false);
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    session.getAal.mockResolvedValue({ aal: "aal1", amr: ["oauth"] });
    expect((await staffResetPasswordAction(initialState, fd({ password: "Nueva-clave-2026", confirm: "Nueva-clave-2026" }))).ok).toBe(false);
  });
  it("con MFA inscrito exige aal2 antes de cambiar la contraseña", async () => {
    session.getAal.mockResolvedValue({ aal: "aal1", amr: ["otp"] });
    supabase.auth.mfa.listFactors.mockResolvedValue({ data: verifiedFactor });
    const r = await staffResetPasswordAction(initialState, fd({ password: "Nueva-clave-2026", confirm: "Nueva-clave-2026" }));
    expect(r.error).toMatch(/autenticador/);
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });
  it("enlace válido + (aal2 si hay MFA) → cambia en Supabase, revoca otras sesiones, audita y pasa por MFA", async () => {
    session.getAal.mockResolvedValue({ aal: "aal2", amr: ["totp", "otp"] });
    supabase.auth.mfa.listFactors.mockResolvedValue({ data: verifiedFactor });
    await expect(staffResetPasswordAction(initialState, fd({ password: "Nueva-clave-2026", confirm: "Nueva-clave-2026" }))).rejects.toThrow("REDIRECT:/gestion/mfa");
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "Nueva-clave-2026" });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(events()).toEqual(["staff.password_reset", "staff.session_revoked"]);
  });
  it("valida la política de contraseña y que coincidan", async () => {
    session.getAal.mockResolvedValue({ aal: "aal1", amr: ["otp"] });
    expect((await staffResetPasswordAction(initialState, fd({ password: "corta", confirm: "corta" }))).fieldErrors?.password).toBeTruthy();
    expect((await staffResetPasswordAction(initialState, fd({ password: "Nueva-clave-2026", confirm: "Otra-clave-2026" }))).fieldErrors?.confirm).toBeTruthy();
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });
});
