import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isLegalSlug, LEGAL_SLUGS, parseLegalText, pendingMarkers, PUBLIC_LEGAL_SLUGS } from "@/lib/domain/legal";
import { docToText, fillPlaceholders, LEGAL_FILES, pendingMarkers as pendingScript } from "../../scripts/lib/legal-map.mjs";
import { readDocx } from "../../scripts/lib/read-docx.mjs";

const BIZ = { name: "TechnoUltra", phone: "3183943465", address: "Cra 1A 59-60" };

describe("texto legal de la plataforma", () => {
  it("parsea títulos, viñetas y párrafos; nunca HTML", () => {
    const b = parseLegalText("## 1. Uno\n\nPárrafo largo\ncontinúa aquí.\n\nOtro párrafo.\n\n### Sub\n- a\n- b\n\n<script>alert(1)</script>");
    expect(b.map((x) => x.type)).toEqual(["h2", "p", "p", "h3", "ul", "p"]);
    expect(b[1].text).toBe("Párrafo largo continúa aquí.");
    expect(b[4].items).toEqual(["a", "b"]);
    expect(b[5].text).toBe("<script>alert(1)</script>"); // texto plano: React lo escapa al renderizar
  });
  it("detecta los campos pendientes y valida los slugs", () => {
    expect(pendingMarkers("a [PENDIENTE: ciudad] b [PENDIENTE: ciudad] [PENDIENTE: CC/NIT]")).toEqual(["[PENDIENTE: ciudad]", "[PENDIENTE: CC/NIT]"]);
    expect(isLegalSlug("terms")).toBe(true);
    expect(isLegalSlug("admin")).toBe(false);
    expect(LEGAL_SLUGS.map((s) => s.slug)).toEqual(expect.arrayContaining(["data_authorization", "ai_consent"]));
    expect((PUBLIC_LEGAL_SLUGS as readonly { slug: string }[]).some((s) => s.slug === "consents")).toBe(false);
  });
});

describe("carga de los documentos del propietario", () => {
  it("rellena solo lo entregado y deja PENDIENTE lo demás (no inventa CC/NIT, ciudad ni correo)", () => {
    const t = fillPlaceholders("[NOMBRE LEGAL COMPLETO DEL RESPONSABLE / TITULAR DE TECHN0ULTRA] [CC/NIT] [DIRECCIÓN FÍSICA DE NOTIFICACIONES] [CIUDAD, COLOMBIA] [CORREO JURÍDICO/DE PRIVACIDAD] [TELÉFONO DE CONTACTO]", BIZ);
    expect(t).toBe("TechnoUltra [PENDIENTE: CC/NIT] Cra 1A 59-60 [PENDIENTE: ciudad], Colombia [PENDIENTE: correo jurídico] 3183943465");
    expect(pendingScript(t)).toHaveLength(3);
  });
  it("sin datos del negocio marca pendiente en lugar de inventar", () => {
    expect(fillPlaceholders("[TELÉFONO DE CONTACTO]", {})).toBe("[PENDIENTE: teléfono]");
  });
  it.skipIf(!existsSync("Legales"))("los 9 documentos Word se convierten, sin portada de borrador y con secciones", async () => {
    for (const f of LEGAL_FILES) {
      const text = docToText(await readDocx(`Legales/${f.file}`), BIZ);
      expect(text.startsWith("## ")).toBe(true);
      expect(text).not.toMatch(/BORRADOR JURÍDICO|\[FECHA DE PUBLICACIÓN\]|Datos que deben completarse/);
      expect(text).not.toMatch(/\[(?!PENDIENTE)[A-ZÁÉÍÓÚ ,/]+\]/); // ningún otro marcador sin resolver
      expect(parseLegalText(text).filter((b) => b.type === "h2").length).toBeGreaterThanOrEqual(7);
      expect(isLegalSlug(f.slug)).toBe(true);
    }
    expect(LEGAL_FILES).toHaveLength(9);
    expect(new Set(LEGAL_FILES.map((f) => f.slug)).size).toBe(9);
  });
});
