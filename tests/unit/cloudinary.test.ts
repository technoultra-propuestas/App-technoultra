import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.server", () => ({
  serverEnv: { cloudinary: () => ({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "key123", CLOUDINARY_API_SECRET: "abcd" }) },
}));

import { signParams, signedUpload, ticketFolder, validateAsset, privateUrl } from "@/lib/cloudinary";

describe("Cloudinary", () => {
  it("firma igual que el ejemplo oficial de la documentación", () => {
    const sig = signParams({ eager: "w_400,h_300,c_pad|w_260,h_200,c_crop", public_id: "sample_image", timestamp: 1315060510 }, "abcd");
    expect(sig).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });
  it("la firma ignora file, api_key, cloud_name y resource_type", () => {
    const a = signParams({ public_id: "x", timestamp: 1 }, "s");
    const b = signParams({ public_id: "x", timestamp: 1, file: "data", api_key: "k", cloud_name: "c", resource_type: "image" }, "s");
    expect(a).toBe(b);
  });
  it("la subida firmada fija carpeta del ticket, tipo privado y formatos permitidos", () => {
    const t = "3f2b8f0e-2c1d-4a53-9b0e-6a1f6f0b1c11";
    const u = signedUpload(t, "reception", "front", 1700000000);
    expect(u.params.folder).toBe(ticketFolder(t));
    expect(u.params.type).toBe("authenticated");
    expect(u.params.allowed_formats).not.toContain("svg");
    expect(u.fullPublicId.startsWith(`${ticketFolder(t)}/reception-front-`)).toBe(true);
    expect(u.signature).toMatch(/^[0-9a-f]{40}$/);
    expect(JSON.stringify(u)).not.toContain("abcd"); // el secreto nunca se devuelve al navegador
  });
  it("valida propiedad por carpeta, privacidad, formato real y tamaño", () => {
    const t = "3f2b8f0e-2c1d-4a53-9b0e-6a1f6f0b1c11";
    const ok = { public_id: `${ticketFolder(t)}/reception-front-1`, resource_type: "image" as const, type: "authenticated", format: "jpg", bytes: 1000 };
    expect(validateAsset(ok, t)).toEqual({ ok: true });
    expect(validateAsset({ ...ok, public_id: "technoultra/tickets/otro/x" }, t)).toEqual({ ok: false, reason: "wrong_ticket" });
    expect(validateAsset({ ...ok, type: "upload" }, t)).toEqual({ ok: false, reason: "not_private" });
    expect(validateAsset({ ...ok, format: "svg" }, t)).toEqual({ ok: false, reason: "format" });
    expect(validateAsset({ ...ok, format: "html" }, t)).toEqual({ ok: false, reason: "format" });
    expect(validateAsset({ ...ok, bytes: 99 * 1024 * 1024 }, t)).toEqual({ ok: false, reason: "size" });
    expect(validateAsset({ ...ok, resource_type: "video", format: "mp4", bytes: 5 * 1024 * 1024 }, t)).toEqual({ ok: true });
  });
  it("la URL privada expira como máximo en 1 hora", () => {
    const url = new URL(privateUrl("technoultra/tickets/x/a", "jpg", "image", 99999, 1000));
    expect(Number(url.searchParams.get("expires_at"))).toBe(1000 + 3600);
    expect(url.searchParams.get("type")).toBe("authenticated");
    expect(url.search).not.toContain("abcd");
  });
});
