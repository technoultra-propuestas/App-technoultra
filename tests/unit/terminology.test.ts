import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });

/** «Aviso» con otro sentido (aviso legal/obligatorio de la IA, aviso de envíos del Shop, etc.) sigue siendo válido. */
const OTHER_MEANING = /aviso obligatorio|aviso de env[ií]os|aviso legal|aviso de diagn[oó]stico|con aviso|aviso informativo|aviso h[aá]ptico/i;

describe("terminología: en la app se dice «notificaciones», no «avisos»", () => {
  const files = walk(path.join(process.cwd(), "src")).filter((f) => !f.includes(`${path.sep}fonts${path.sep}`));

  it("ningún texto visible usa «aviso(s)» como sinónimo de notificación (los comentarios internos no cuentan)", () => {
    const offenders: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const t = line.trim();
          if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*")) return;
          const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
          if (/\bavisos?\b/i.test(code) && !OTHER_MEANING.test(code)) offenders.push(`${path.relative(process.cwd(), f)}:${i + 1}: ${t.slice(0, 90)}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("la ruta es /notificaciones y el enlace antiguo /avisos redirige (conserva la consulta)", () => {
    const cfg = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(cfg).toMatch(/source: "\/avisos", destination: "\/notificaciones"/);
    expect(statSync(path.join(process.cwd(), "src/app/notificaciones/page.tsx")).isFile()).toBe(true);
    expect(() => statSync(path.join(process.cwd(), "src/app/avisos"))).toThrow();
  });
});
