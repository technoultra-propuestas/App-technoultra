import { beforeEach, describe, expect, it, vi } from "vitest";

const S = { error: null as null | { code: string; message: string }, calls: 0 };
vi.mock("server-only", () => ({}));
vi.mock("@/lib/observability", () => ({ reportActionError: vi.fn(async () => "ref") }));
vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ from: () => ({ select: () => ({ limit: async () => { S.calls++; return { error: S.error }; } }) }) }),
}));

import { checkDatabase } from "@/lib/health";
import { reportActionError } from "@/lib/observability";

beforeEach(() => { S.error = null; S.calls = 0; vi.clearAllMocks(); });

describe("latido de la base de datos", () => {
  it("lee sin escribir, devuelve true y reutiliza el resultado 30 s", async () => {
    expect(await checkDatabase(1_000_000)).toBe(true);
    expect(await checkDatabase(1_010_000)).toBe(true);
    expect(S.calls).toBe(1);
  });
  it("si la base falla devuelve false y avisa (depurado) una sola vez por ventana", async () => {
    S.error = { code: "PGRST000", message: "down" };
    expect(await checkDatabase(2_000_000)).toBe(false);
    expect(await checkDatabase(2_005_000)).toBe(false);
    expect(reportActionError).toHaveBeenCalledTimes(1);
    expect(S.calls).toBe(1);
  });
});
