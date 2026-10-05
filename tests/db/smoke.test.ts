import { describe, expect, it } from "vitest";
import { createDb } from "./harness";

describe("migraciones", () => {
  it("se aplican completas sobre una base vacía", async () => {
    const db = await createDb();
    const r = await db.query<{ n: number }>(
      `select count(*)::int n from pg_tables where schemaname = 'public'`,
    );
    expect(r.rows[0].n).toBeGreaterThanOrEqual(55);
  }, 120000);
});
