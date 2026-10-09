import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(path.resolve(__dirname, "../..", p), "utf8");

describe("copias de seguridad", () => {
  const wf = read(".github/workflows/backup.yml");
  it("corre cada noche y a demanda, con permisos mínimos", () => {
    expect(wf).toMatch(/cron: "0 8 \* \* \*"/);
    expect(wf).toMatch(/workflow_dispatch/);
    expect(wf).toMatch(/permissions:\s*\n\s*contents: read/);
  });
  it("cifra con AES-256 antes de subir y elimina el paquete sin cifrar; conserva 30 días", () => {
    expect(wf).toMatch(/--symmetric --cipher-algo AES256/);
    expect(wf).toMatch(/rm -rf backup/);
    expect(wf).toMatch(/retention-days: 30/);
    expect(wf.indexOf("symmetric")).toBeLessThan(wf.indexOf("upload-artifact"));
  });
  it("los secretos solo vienen de GitHub Secrets y se comprueba que existan", () => {
    for (const s of ["SUPABASE_DB_URL", "SUPABASE_SERVICE_ROLE_KEY", "BACKUP_PASSPHRASE", "NEXT_PUBLIC_SUPABASE_URL"]) expect(wf).toContain(`secrets.${s}`);
    expect(wf).not.toMatch(/echo .*\$\{?(SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|BACKUP_PASSPHRASE)/);
  });
  it("la segunda copia en R2 es opcional, sube solo el archivo cifrado y verifica el tamaño", () => {
    expect(wf).toMatch(/if: \$\{\{ env\.R2_BUCKET != ''/);
    for (const s of ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) expect(wf).toContain(`secrets.${s}`);
    expect(wf).toMatch(/aws s3 cp "\$BACKUP_FILE"/);
    expect(wf).toMatch(/head-object/);
    expect(wf.indexOf("symmetric")).toBeLessThan(wf.indexOf("aws s3 cp"));
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
});
