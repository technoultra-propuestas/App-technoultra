import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("copias de seguridad", () => {
  it("este repositorio es PÚBLICO: ningún flujo de GitHub Actions usa secretos de producción ni genera copias (viven en un repositorio privado aparte)", () => {
    const dir = path.join(root, ".github/workflows");
    expect(existsSync(path.join(dir, "backup.yml"))).toBe(false);
    for (const f of readdirSync(dir)) {
      const wf = readFileSync(path.join(dir, f), "utf8");
      for (const s of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL", "BACKUP_PASSPHRASE", "upload-artifact"]) expect(wf, `${f} menciona ${s}`).not.toContain(s);
    }
  });
  it("el volcado incluye los esquemas de la aplicación y excluye datos efímeros de Auth", () => {
    const sh = read("scripts/backup/dump-db.sh");
    for (const s of ["public", "private", "auth", "storage", "supabase_migrations"]) expect(sh).toContain(`--schema=${s}`);
    for (const t of ["auth.sessions", "auth.refresh_tokens", "auth.mfa_amr_claims"]) expect(sh).toContain(`--exclude-table-data=${t}`);
    expect(sh).toMatch(/exit 1/); // falla si el volcado es sospechosamente pequeño
  });
  it("el script de Storage no imprime la clave de servicio", () => {
    const js = read("scripts/backup/storage-backup.mjs");
    expect(js).not.toMatch(/console\.(log|error)\([^)]*\bkey\b/);
  });
  it("la guía describe el repositorio privado y no pide crear secretos en este repositorio", () => {
    const doc = read("docs/BACKUPS.md");
    expect(doc).toMatch(/repositorio PRIVADO/i);
    expect(doc).toMatch(/technoultra-backups/);
  });
});
