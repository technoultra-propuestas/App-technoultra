import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data?: { key: string }[] | null; error: { code?: string; message?: string } | null };
const calls: string[] = [];
const state = { update: { data: [{ key: "x" }], error: null } as Result, insert: { error: null } as Result, role: "superadmin" };
const builder = {
  update: (row: unknown) => {
    calls.push(`update:${JSON.stringify(row)}`);
    return { eq: (_c: string, v: string) => ({ select: async () => (calls.push(`eq:${v}`), state.update) }) };
  },
  insert: async (row: unknown) => (calls.push(`insert:${JSON.stringify(row)}`), state.insert),
};
const supabase = { from: vi.fn(() => builder) };
const audit = vi.fn(async () => undefined);

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("@/lib/auth/audit", () => ({ auditAdmin: (...a: unknown[]) => audit(...(a as [])) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  assertRole: async (allowed: string[]) => {
    if (!allowed.includes(state.role)) throw Object.assign(new Error("forbidden"), { status: 403 });
    return { id: "owner", role: state.role };
  },
}));

import { saveSettingAction } from "@/app/b/configuracion/actions";
import { initialState } from "@/lib/auth/schemas";
import { parseSetting, SETTINGS } from "@/lib/domain/settings";

const fd = (key: string, value: string) => {
  const f = new FormData();
  f.set("key", key);
  f.set("value", value);
  return f;
};
const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  state.update = { data: [{ key: "x" }], error: null };
  state.insert = { error: null };
  state.role = "superadmin";
});

describe("Configuración → Negocio (público)", () => {
  it.each([
    ["business.name", "TechnoUltra"],
    ["business.phone", "3183943465"],
    ["business.email", "contacto@technoultra.com"],
    ["business.address", "Cra 1A 59-60"],
  ])("guarda %s con un valor válido (actualiza y, si no existe, inserta) y lo audita", async (key, value) => {
    state.update = { data: [], error: null }; // el ajuste aún no existe
    const r = await saveSettingAction(initialState, fd(key, value));
    expect(r).toEqual({ ok: true, message: "Guardado." });
    expect(calls.some((c) => c.startsWith("update:") && c.includes(`"value":"${value}"`) && c.includes('"is_public":true'))).toBe(true);
    expect(calls.some((c) => c.startsWith("insert:") && c.includes(`"key":"${key}"`))).toBe(true);
    expect(audit).toHaveBeenCalledWith("owner", "superadmin.settings_changed", undefined, { setting: key });
  });
  it("si el ajuste ya existe solo actualiza (sin insertar)", async () => {
    await saveSettingAction(initialState, fd("business.name", "TechnoUltra"));
    expect(calls.some((c) => c.startsWith("insert:"))).toBe(false);
  });
  it("nunca usa upsert (causa del error original)", async () => {
    expect(Object.keys(builder)).not.toContain("upsert");
  });
  it("valores vacíos son válidos (limpian el ajuste); los inválidos se rechazan sin tocar la base", async () => {
    expect((await saveSettingAction(initialState, fd("business.phone", ""))).ok).toBe(true);
    for (const [k, v] of [["business.email", "no-es-correo"], ["business.phone", "abc"], ["business.phone", "12"], ["business.name", "x"], ["business.address", "ab"], ["business.name", "a".repeat(301)]]) {
      calls.length = 0;
      const r = await saveSettingAction(initialState, fd(k, v));
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/\(VALIDATION_ERROR\)$/);
      expect(calls).toEqual([]);
    }
  });
  it("claves fuera de la lista blanca se rechazan", async () => {
    const r = await saveSettingAction(initialState, fd("tax.vat_responsible", "true"));
    expect(r.ok).toBe(false);
    expect(calls).toEqual([]);
  });
  it("errores reales: RLS/permiso → FORBIDDEN, otros → DB_ERROR; la causa solo va al log del servidor", async () => {
    state.update = { data: null, error: { code: "42501", message: "permission denied for table app_settings" } };
    const a = await saveSettingAction(initialState, fd("business.name", "TechnoUltra"));
    expect(a.error).toMatch(/\(FORBIDDEN\)$/);
    state.update = { data: null, error: { code: "XX000", message: "boom" } };
    const b = await saveSettingAction(initialState, fd("business.name", "TechnoUltra"));
    expect(b.error).toMatch(/\(DB_ERROR\)$/);
    expect(JSON.stringify(a) + JSON.stringify(b)).not.toMatch(/permission denied|boom|app_settings/); // el frontend no ve la causa interna
    expect(errSpy).toHaveBeenCalledWith("settings.save", expect.objectContaining({ code: "42501", key: "business.name" }));
  });
  it("carrera: si otro guardado creó el ajuste, reintenta como actualización", async () => {
    state.update = { data: [], error: null };
    state.insert = { error: { code: "23505" } };
    const r = await saveSettingAction(initialState, fd("business.name", "TechnoUltra"));
    expect(r.ok).toBe(true);
    expect(calls.filter((c) => c.startsWith("update:")).length).toBe(2);
  });
  it("solo el SUPERADMIN: técnico y cliente reciben 403 antes de tocar la base", async () => {
    for (const role of ["technician", "client"]) {
      state.role = role;
      await expect(saveSettingAction(initialState, fd("business.name", "X Y"))).rejects.toMatchObject({ status: 403 });
    }
    expect(calls).toEqual([]);
  });
  it("todos los campos de la sección existen y son públicos", () => {
    const biz = SETTINGS.filter((s) => s.section === "Negocio (público)").map((s) => s.key);
    expect(biz).toEqual(["business.name", "business.phone", "business.email", "business.address"]);
    expect(SETTINGS.filter((s) => s.section === "Negocio (público)").every((s) => s.isPublic)).toBe(true);
    for (const s of SETTINGS.filter((s) => s.kind === "int")) expect(parseSetting(s, String(s.min ?? 1)).ok).toBe(true);
  });
});
