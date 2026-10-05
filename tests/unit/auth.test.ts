import { describe, expect, it } from "vitest";
import { isAuthPage, isProtectedPath, roleHome, safeNext } from "@/lib/auth/routes";
import { newPasswordSchema, password, phoneCO, signUpSchema, verifyOtpSchema } from "@/lib/auth/schemas";
import { buildCsp } from "@/lib/security/csp";

describe("safeNext (anti open-redirect)", () => {
  it("acepta rutas internas", () => {
    expect(safeNext("/c")).toBe("/c");
    expect(safeNext("/b/tickets?x=1")).toBe("/b/tickets?x=1");
  });
  it.each([
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "/%0d%0aSet-Cookie:x",
    "evil.com",
    "",
    "/a\nb",
    "/" + "a".repeat(400),
  ])("rechaza %j", (v) => {
    expect(safeNext(v, "/seguro")).toBe("/seguro");
  });
  it("null/undefined usan el valor por defecto", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined, "/x")).toBe("/x");
  });
});

describe("rutas protegidas y por rol", () => {
  it("clasifica rutas", () => {
    for (const p of ["/c", "/c/tickets", "/b", "/b/usuarios", "/onboarding", "/restablecer"])
      expect(isProtectedPath(p)).toBe(true);
    for (const p of ["/", "/login", "/legal/terms", "/seguimiento", "/cuenta", "/cx"])
      expect(isProtectedPath(p)).toBe(false);
    expect(isAuthPage("/login")).toBe(true);
    expect(isAuthPage("/equipo")).toBe(true);
    expect(isAuthPage("/c")).toBe(false);
  });
  it("cada rol aterriza en su zona", () => {
    expect(roleHome("client")).toBe("/c");
    expect(roleHome("technician")).toBe("/b");
    expect(roleHome("admin")).toBe("/b");
  });
});

describe("validación de credenciales", () => {
  it("política de contraseña", () => {
    expect(password.safeParse("corta1A").success).toBe(false);
    expect(password.safeParse("todominusculas123").success).toBe(false);
    expect(password.safeParse("SINNUMEROSAQUIABC").success).toBe(false);
    expect(password.safeParse("Valida12345").success).toBe(true);
  });
  it("registro exige términos y normaliza el correo", () => {
    const base = { fullName: "Ana Pérez", email: " ANA@Gmail.COM ", password: "Valida12345" };
    expect(signUpSchema.safeParse(base).success).toBe(false);
    const ok = signUpSchema.safeParse({ ...base, terms: "on" });
    expect(ok.success && ok.data.email).toBe("ana@gmail.com");
  });
  it("el código OTP son exactamente 6 dígitos", () => {
    for (const t of ["12345", "1234567", "abcdef", "12 345", ""])
      expect(verifyOtpSchema.safeParse({ email: "a@b.co", token: t }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ email: "a@b.co", token: "123456" }).success).toBe(true);
  });
  it("las contraseñas nuevas deben coincidir", () => {
    expect(newPasswordSchema.safeParse({ password: "Valida12345", confirm: "Otra123456" }).success).toBe(
      false,
    );
    expect(newPasswordSchema.safeParse({ password: "Valida12345", confirm: "Valida12345" }).success).toBe(
      true,
    );
  });
  it("celular colombiano", () => {
    expect(phoneCO.parse("300 123 4567")).toBe("3001234567");
    expect(phoneCO.parse("+57 300-123-4567")).toBe("3001234567");
    expect(phoneCO.safeParse("1234567890").success).toBe(false);
    expect(phoneCO.safeParse("300123").success).toBe(false);
  });
});

describe("CSP", () => {
  const prod = buildCsp("abc", { isDev: false, supabaseUrl: "https://abcd.supabase.co" });
  it("no permite eval ni scripts en línea sin nonce en producción", () => {
    expect(prod).not.toContain("unsafe-eval");
    expect(prod).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(prod).not.toMatch(/script-src[^;]*unsafe-inline/);
  });
  it("bloquea frames, objetos y base-uri ajenos", () => {
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("base-uri 'self'");
    expect(prod).toContain("upgrade-insecure-requests");
  });
  it("permite solo los orígenes necesarios (Supabase, Cloudinary, Google avatars)", () => {
    expect(prod).toContain("https://abcd.supabase.co");
    expect(prod).toContain("https://res.cloudinary.com");
    expect(prod).not.toMatch(/\*\s*[;']/); // sin comodín abierto
  });
  it("solo en desarrollo se admite unsafe-eval", () => {
    expect(buildCsp("n", { isDev: true, supabaseUrl: "https://a.supabase.co" })).toContain("unsafe-eval");
  });
});
