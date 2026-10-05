import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SECRET_HINT = /(SECRET|SERVICE_ROLE|PRIVATE|ACCESS_TOKEN|API_KEY|PASSWORD|SALT|AUTH_TOKEN)/i;

describe(".env.example", () => {
  const lines = readFileSync(".env.example", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l));
  const names = lines.map((l) => l.split("=")[0]);

  it("ninguna variable NEXT_PUBLIC_ parece un secreto", () => {
    const bad = names.filter((n) => n.startsWith("NEXT_PUBLIC_") && SECRET_HINT.test(n));
    expect(bad).toEqual([]);
  });

  it("no incluye valores reales (todo vacío o valor local de ejemplo)", () => {
    const withValues = lines.filter((l) => {
      const v = l.slice(l.indexOf("=") + 1).trim();
      return v !== "" && !/^(http:\/\/localhost:3000|mailto:)$/.test(v);
    });
    expect(withValues).toEqual([]);
  });

  it("las variables privadas previstas existen", () => {
    for (const n of [
      "SUPABASE_SERVICE_ROLE_KEY",
      "GEMINI_API_KEY",
      "MERCADOPAGO_ACCESS_TOKEN",
      "RESEND_API_KEY",
      "CLOUDINARY_API_SECRET",
    ]) {
      expect(names).toContain(n);
    }
  });
});
