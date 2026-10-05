import { describe, expect, it } from "vitest";
import { decodePngDataUrl, MAX_SIGNATURE_BYTES } from "@/lib/documents/signature";

const png = (size: number, magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) => {
  const b = new Uint8Array(size).fill(7);
  magic.forEach((m, i) => (b[i] = m));
  return "data:image/png;base64," + Buffer.from(b).toString("base64");
};

describe("validación de firma", () => {
  it("acepta un PNG real de tamaño razonable", () => {
    expect(decodePngDataUrl(png(3000))).not.toBeNull();
  });
  it("rechaza lienzos en blanco (muy pequeños) y archivos enormes", () => {
    expect(decodePngDataUrl(png(300))).toBeNull();
    expect(decodePngDataUrl(png(MAX_SIGNATURE_BYTES + 10))).toBeNull();
  });
  it("rechaza contenido que no es PNG aunque declare image/png", () => {
    expect(decodePngDataUrl(png(3000, [0x3c, 0x73, 0x76, 0x67, 0, 0, 0, 0]))).toBeNull(); // <svg
    expect(decodePngDataUrl(png(3000, [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBeNull(); // jpeg
  });
  it("rechaza otros esquemas y base64 inválido", () => {
    expect(decodePngDataUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBeNull();
    expect(decodePngDataUrl("javascript:alert(1)")).toBeNull();
    expect(decodePngDataUrl("data:image/png;base64,@@@@")).toBeNull();
    expect(decodePngDataUrl("")).toBeNull();
  });
});
