import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = {
  auth: {
    signUp: vi.fn(),
    resend: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
};
const jar = { set: vi.fn() };
const allow = vi.fn(async () => true);

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("@/lib/env.public", () => ({ getPublicEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.technoultra.com" }) }));
vi.mock("@/lib/auth/rate-limit", () => ({ allow: (...a: unknown[]) => allow(...(a as [])), clientIp: async () => "1.2.3.4", TOO_MANY: "Demasiados intentos." }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { requestPasswordResetAction, resendEmailAction, signUpAction } from "@/app/(auth)/actions";
import { initialState } from "@/lib/auth/schemas";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const CALLBACK = "https://app.technoultra.com/auth/callback";

beforeEach(() => {
  vi.clearAllMocks();
  allow.mockResolvedValue(true);
  supabase.auth.signUp.mockResolvedValue({ error: null });
  supabase.auth.resend.mockResolvedValue({ error: null });
  supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
});

describe("correos de acceso (enlace, no código)", () => {
  it("el registro envía el enlace al callback exacto y lleva a 'Revisa tu correo'", async () => {
    await expect(signUpAction(initialState, fd({ email: "a@b.co", password: "Clave-segura-123", fullName: "Ana Pérez", terms: "on" }))).rejects.toThrow(/REDIRECT:\/verificar\?email=a%40b\.co&mode=signup/);
    expect(supabase.auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(CALLBACK);
  });
  it("reenviar el correo de registro conserva el redirect exacto (sin él el enlace caería en /?code=)", async () => {
    const r = await resendEmailAction(initialState, fd({ email: "a@b.co", mode: "signup" }));
    expect(r.ok).toBe(true);
    expect(supabase.auth.resend).toHaveBeenCalledWith({ type: "signup", email: "a@b.co", options: { emailRedirectTo: CALLBACK } });
  });
  it("la recuperación usa el callback exacto y guarda el destino en una cookie, no en la URL", async () => {
    await expect(requestPasswordResetAction(initialState, fd({ email: "a@b.co" }))).rejects.toThrow(/REDIRECT:\/verificar\?email=a%40b\.co&mode=recovery/);
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.co", { redirectTo: CALLBACK });
    expect(jar.set).toHaveBeenCalledWith("tu_next", "/restablecer", expect.objectContaining({ httpOnly: true, path: "/auth" }));
  });
  it("reenviar respeta el límite de intentos y no revela si la cuenta existe", async () => {
    allow.mockResolvedValue(false);
    const limited = await resendEmailAction(initialState, fd({ email: "a@b.co", mode: "signup" }));
    expect(limited.ok).toBe(false);
    expect(supabase.auth.resend).not.toHaveBeenCalled();
    allow.mockResolvedValue(true);
    supabase.auth.resend.mockResolvedValue({ error: { status: 400, code: "over_email_send_rate_limit" } });
    expect((await resendEmailAction(initialState, fd({ email: "x@y.co", mode: "signup" }))).ok).toBe(true);
  });
});
