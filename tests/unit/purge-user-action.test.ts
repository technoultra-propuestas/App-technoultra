import { beforeEach, describe, expect, it, vi } from "vitest";

const S = { role: "superadmin" as "superadmin" | "technician", rpc: { data: { assets: {} } as unknown, error: null as null | { code?: string; message: string } }, limited: false };
const rpc = vi.fn(async () => S.rpc);
const remove = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc, storage: { from: () => ({ remove }) } }) }));
vi.mock("@/lib/auth/session", () => ({
  assertRole: async (allowed: string[]) => {
    if (!allowed.includes(S.role)) throw new Error("forbidden");
    return { id: "actor-1", role: S.role };
  },
}));
vi.mock("@/lib/auth/rate-limit", () => ({ allow: async () => !S.limited, TOO_MANY: "Demasiados intentos." }));
vi.mock("@/lib/cloudinary", () => ({ destroyAssets: vi.fn(async () => ({ requested: 0 })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { purgeUserAction } from "@/app/b/usuarios/purge-actions";

const U = "33333333-3333-4333-8333-333333333333";
const fd = (email = "prueba@correo.com") => {
  const f = new FormData();
  f.set("userId", U);
  f.set("confirmEmail", email);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  S.role = "superadmin";
  S.limited = false;
  S.rpc = { data: { assets: { documents: ["a/b.pdf"], cloudinary: ["x/1"] } }, error: null };
});

describe("eliminar cuenta (solo superadmin)", () => {
  it("un técnico no puede: la acción rechaza antes de tocar la base de datos", async () => {
    S.role = "technician";
    await expect(purgeUserAction({ ok: false }, fd())).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("el actor sale de la sesión, nunca del formulario; el correo viaja normalizado", async () => {
    const f = fd("  PRUEBA@Correo.com ");
    f.set("actorId", "otro");
    const r = await purgeUserAction({ ok: false }, f);
    expect(r.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("admin_purge_user", { p_actor: "actor-1", p_target: U, p_confirm_email: "prueba@correo.com" });
    expect(remove).toHaveBeenCalledWith(["a/b.pdf"]);
  });

  it("sin correo válido no se llama a la base de datos", async () => {
    const r = await purgeUserAction({ ok: false }, fd("no-es-correo"));
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("respeta el límite de intentos", async () => {
    S.limited = true;
    const r = await purgeUserAction({ ok: false }, fd());
    expect(r.error).toBe("Demasiados intentos.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["email_mismatch", /no coincide/],
    ["cannot_purge_superadmin", /superadministrador/],
    ["cannot_purge_self", /propia cuenta/],
    ["purge_blocked:public.ticket_exceptions:authorized_by", /trazabilidad/],
  ])("mapea el error %s a un mensaje claro y no borra archivos", async (code, re) => {
    S.rpc = { data: null, error: { code: "23503", message: code } };
    const r = await purgeUserAction({ ok: false }, fd());
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(re);
    expect(remove).not.toHaveBeenCalled();
  });
});
