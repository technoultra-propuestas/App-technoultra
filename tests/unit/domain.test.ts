import { describe, expect, it } from "vitest";
import { priceText } from "@/lib/domain/catalog";
import { equipmentSchema } from "@/lib/domain/equipment";
import { COVERAGE_MESSAGE, friendlyRequestError, nextBusinessDays, requestSchema, toPreferredAt } from "@/lib/domain/requests";
import { formToObject, serviceSchema, slugify, toServiceRow } from "@/lib/domain/service";

describe("agenda de solicitudes", () => {
  // Miércoles 2026-10-07 10:00 en Colombia
  const now = new Date("2026-10-07T15:00:00Z");
  it("calcula días hábiles (lunes–sábado) desde mañana", () => {
    expect(nextBusinessDays(4, now)).toEqual(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-12"]); // salta el domingo 11
  });
  it("respeta la zona horaria de Colombia cerca de medianoche UTC", () => {
    // 2026-10-08 03:00 UTC = 2026-10-07 22:00 en Bogotá → "mañana" es el 8
    expect(nextBusinessDays(1, new Date("2026-10-08T03:00:00Z"))).toEqual(["2026-10-08"]);
  });
  it("solo acepta fechas dentro de los próximos días hábiles", () => {
    expect(toPreferredAt("2026-10-08", "morning", now)).toBe("2026-10-08T09:00:00-05:00");
    expect(toPreferredAt("2026-10-08", "afternoon", now)).toBe("2026-10-08T14:00:00-05:00");
    expect(toPreferredAt("2026-10-11", "morning", now)).toBeNull(); // domingo
    expect(toPreferredAt("2020-01-01", "morning", now)).toBeNull(); // pasado
    expect(toPreferredAt("2027-01-01", "morning", now)).toBeNull(); // muy lejano
    expect(toPreferredAt(undefined, "morning", now)).toBeNull();
  });
});

describe("solicitudes", () => {
  const base = { serviceId: "3f2b8f0e-2c1d-4a53-9b0e-6a1f6f0b1c11", modality: "pickup", problem: "No enciende bien" };
  it("valida modalidad y descripción", () => {
    expect(requestSchema.safeParse(base).success).toBe(true);
    expect(requestSchema.safeParse({ ...base, modality: "teleport" }).success).toBe(false);
    expect(requestSchema.safeParse({ ...base, problem: "hola" }).success).toBe(false);
    expect(requestSchema.safeParse({ ...base, serviceId: "no-uuid" }).success).toBe(false);
  });
  it("traduce errores de base de datos y nunca expone texto técnico", () => {
    expect(friendlyRequestError("out_of_coverage")).toBe(COVERAGE_MESSAGE);
    expect(friendlyRequestError('new row violates row-level security policy for table "service_requests"')).toBe("No pudimos crear tu solicitud. Inténtalo de nuevo.");
    expect(friendlyRequestError(undefined)).toContain("No pudimos");
    expect(COVERAGE_MESSAGE).toContain("asistencia remota");
  });
});

describe("equipos", () => {
  it("acepta datos válidos y normaliza vacíos a null", () => {
    const r = equipmentSchema.parse({ type: "laptop", brand: "HP", model: "14-R005LA", serial: "", year: "2015" });
    expect(r.serial).toBeNull();
    expect(r.year).toBe(2015);
  });
  it("rechaza tipo, marca o año inválidos", () => {
    expect(equipmentSchema.safeParse({ type: "toaster", brand: "x", model: "y" }).success).toBe(false);
    expect(equipmentSchema.safeParse({ type: "laptop", brand: "", model: "y" }).success).toBe(false);
    expect(equipmentSchema.safeParse({ type: "laptop", brand: "a", model: "b", year: "1800" }).success).toBe(false);
  });
});

describe("catálogo", () => {
  it("slugify elimina tildes y símbolos", () => {
    expect(slugify("Instalación de Windows 11!")).toBe("instalacion-de-windows-11");
    expect(slugify("  Migración  a SSD ")).toBe("migracion-a-ssd");
  });
  it("priceText respeta el modo de precio", () => {
    expect(priceText({ price_mode: "quote", base_price: null, price_unit: null })).toBe("A cotizar");
    expect(priceText({ price_mode: "from", base_price: 90000, price_unit: null })).toMatch(/^Desde \$90\.000$|^Desde \$90,000$/);
    expect(priceText({ price_mode: "fixed", base_price: 150000, price_unit: "/mes" })).toMatch(/150[.,]000\/mes$/);
  });
  it("serviceSchema exige al menos una modalidad y precio base salvo 'a cotizar'", () => {
    const fd = new FormData();
    fd.set("name", "Soporte remoto");
    fd.set("kind", "technical");
    fd.set("priceMode", "fixed");
    fd.set("warrantyKind", "labor");
    expect(serviceSchema.safeParse(formToObject(fd)).success).toBe(false); // sin modalidades ni precio
    fd.append("modalities", "remote");
    expect(serviceSchema.safeParse(formToObject(fd)).success).toBe(false); // falta precio base
    fd.set("priceMode", "quote");
    const ok = serviceSchema.safeParse(formToObject(fd));
    expect(ok.success).toBe(true);
    if (ok.success) {
      const row = toServiceRow(ok.data);
      expect(row.allowed_modalities).toEqual(["remote"]);
      expect(row.base_price).toBeNull();
      expect(row.slug).toBe("soporte-remoto");
    }
  });
  it("las modalidades inválidas se rechazan", () => {
    const fd = new FormData();
    fd.set("name", "X Y");
    fd.set("kind", "technical");
    fd.set("priceMode", "quote");
    fd.set("warrantyKind", "labor");
    fd.append("modalities", "teleport");
    expect(serviceSchema.safeParse(formToObject(fd)).success).toBe(false);
  });
});
