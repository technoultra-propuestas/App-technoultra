import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  user: { id: "owner", user_metadata: {}, app_metadata: {} } as Record<string, unknown> | null,
  profile: { id: "owner", role: "superadmin", email: "owner@technoultra.com", full_name: "Dueño", is_active: true } as Record<string, unknown> | null,
  claims: { aal: "aal2", amr: [{ method: "totp" }] } as Record<string, unknown> | null,
  target: { id: "11111111-1111-4111-8111-111111111111", role: "technician" } as { id: string; role: string } | null,
};
const supabase = {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: state.user }, error: null })),
    getClaims: vi.fn(async () => ({ data: state.claims ? { claims: state.claims } : null })),
  },
  from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile }) }) }) })),
};
const adminApi = {
  createUser: vi.fn(async () => ({ data: { user: { id: "22222222-2222-4222-8222-222222222222" } }, error: null })),
  generateLink: vi.fn(async () => ({ data: { properties: { hashed_token: "hash" } }, error: null })),
  mfa: { listFactors: vi.fn(async () => ({ data: { factors: [{ id: "f1" }] } })), deleteFactor: vi.fn(async () => ({})) },
};
const admin = {
  auth: { admin: adminApi },
  from: vi.fn(() => ({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: null }) }), maybeSingle: async () => ({ data: state.target }) }) }) })),
  rpc: vi.fn(async () => ({ error: null })),
};
const allow = vi.fn(async () => true);
const sendEmail = vi.fn(async (..._a: unknown[]) => ({ sent: true, id: "m1" }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("@/lib/email", () => ({ sendNotificationEmail: (...a: unknown[]) => sendEmail(...(a as [])) }));
vi.mock("@/lib/env.public", () => ({ getPublicEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.technoultra.com" }) }));
vi.mock("@/lib/auth/rate-limit", () => ({ allow: (...a: unknown[]) => allow(...(a as [])), clientIp: async () => "1.2.3.4", TOO_MANY: "Demasiados intentos." }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("react", async (orig) => ({ ...((await orig()) as object), cache: <T,>(fn: T) => fn }));

import { inviteStaffAction, resetStaffMfaAction } from "@/app/b/usuarios/actions";
import { initialState } from "@/lib/auth/schemas";
import { assertRole } from "@/lib/auth/session";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const invite = { email: "nuevo@gmail.com", fullName: "Nuevo Técnico", role: "technician" };

beforeEach(() => {
  vi.clearAllMocks();
  allow.mockResolvedValue(true);
  state.user = { id: "owner", user_metadata: {}, app_metadata: {} };
  state.profile = { id: "owner", role: "superadmin", email: "owner@technoultra.com", full_name: "Dueño", is_active: true };
  state.claims = { aal: "aal2", amr: [{ method: "totp" }] };
  state.target = { id: "11111111-1111-4111-8111-111111111111", role: "technician" };
});

describe("el rol sale SIEMPRE de la base de datos y de un JWT verificado", () => {
  it("metadatos del usuario o app con role=superadmin no elevan privilegios", async () => {
    state.user = { id: "u1", user_metadata: { role: "superadmin", is_admin: true }, app_metadata: { role: "superadmin", roles: ["superadmin"] } };
    state.profile = { id: "u1", role: "technician", email: "t@technoultra.com", full_name: "T", is_active: true };
    await expect(assertRole(["superadmin"])).rejects.toMatchObject({ status: 403 });
    state.profile = { ...state.profile, role: "client" };
    await expect(assertRole(["technician", "superadmin"])).rejects.toMatchObject({ status: 403 });
  });
  it("un aal2 declarado fuera del JWT verificado no cuenta: sin claims el SUPERADMIN queda en aal1", async () => {
    state.claims = null;
    await expect(assertRole(["superadmin"])).rejects.toMatchObject({ status: 401 });
    state.claims = { aal: "aal1", amr: [{ method: "password" }] };
    await expect(assertRole(["superadmin"])).rejects.toMatchObject({ status: 401 });
    state.claims = { aal: "aal2", amr: [{ method: "totp" }] };
    await expect(assertRole(["superadmin"])).resolves.toMatchObject({ role: "superadmin" });
  });
});

describe("alta de personal: el propietario es único", () => {
  it.each(["superadmin", "admin", "owner", "client", ""])("rechaza role=%s enviado desde el formulario", async (role) => {
    const r = await inviteStaffAction(initialState, fd({ ...invite, role }));
    expect(r.ok).toBe(false);
    expect(adminApi.createUser).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });
  it("solo crea TÉCNICOS: la función de BD recibe technician y el correo lo dice", async () => {
    const r = await inviteStaffAction(initialState, fd(invite));
    expect(r.ok).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith("admin_provision_staff", expect.objectContaining({ p_actor: "owner", p_role: "technician" }));
    expect(sendEmail.mock.calls[0][1]).toMatchObject({ body: expect.stringContaining("técnico") });
  });
  it("un técnico o un cliente no pueden invitar personal", async () => {
    for (const role of ["technician", "client"]) {
      state.profile = { ...state.profile, role };
      await expect(inviteStaffAction(initialState, fd(invite))).rejects.toMatchObject({ status: 403 });
    }
    expect(adminApi.createUser).not.toHaveBeenCalled();
  });
  it("sin MFA (aal1) el propietario tampoco puede invitar", async () => {
    state.claims = { aal: "aal1", amr: [{ method: "password" }] };
    await expect(inviteStaffAction(initialState, fd(invite))).rejects.toMatchObject({ status: 401 });
  });
});

describe("restablecer MFA de otra persona", () => {
  it("funciona sobre un técnico y se audita con los nombres superadmin.*", async () => {
    await resetStaffMfaAction(fd({ userId: state.target!.id }));
    expect(adminApi.mfa.deleteFactor).toHaveBeenCalled();
    expect(admin.rpc).toHaveBeenCalledWith("log_admin_event", expect.objectContaining({ p_event: "superadmin.security_changed", p_actor: "owner" }));
  });
  it("nunca sobre uno mismo ni sobre clientes, y exige propietario con MFA", async () => {
    await resetStaffMfaAction(fd({ userId: "owner" }));
    state.target = { id: "11111111-1111-4111-8111-111111111111", role: "client" };
    await resetStaffMfaAction(fd({ userId: state.target.id }));
    expect(adminApi.mfa.deleteFactor).not.toHaveBeenCalled();
    state.profile = { ...state.profile, role: "technician" };
    await expect(resetStaffMfaAction(fd({ userId: "11111111-1111-4111-8111-111111111111" }))).rejects.toMatchObject({ status: 403 });
  });
});
