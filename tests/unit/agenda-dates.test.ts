import { describe, expect, it } from "vitest";
import { addDays, dayKey, greeting, isDayKey, startOfDay, weekStart } from "@/lib/domain/agenda";

describe("fechas del panel (hora de Colombia, UTC−5)", () => {
  it("el día se calcula en Colombia, no en UTC", () => {
    expect(dayKey("2026-10-06T03:30:00Z")).toBe("2026-10-05"); // 22:30 del 5 en Bogotá
    expect(dayKey("2026-10-06T05:00:00Z")).toBe("2026-10-06");
    expect(startOfDay("2026-10-06").toISOString()).toBe("2026-10-06T05:00:00.000Z");
  });
  it("suma días y calcula el lunes de la semana", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekStart("2026-10-05")).toBe("2026-10-05"); // lunes
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // domingo
    expect(weekStart("2026-10-07")).toBe("2026-10-05");
  });
  it("valida la clave de día recibida por URL", () => {
    expect(isDayKey("2026-10-05")).toBe(true);
    for (const bad of ["", "hoy", "2026-13-40x", undefined, "2026-1-5"]) expect(isDayKey(bad)).toBe(false);
  });
  it("saluda según la hora local", () => {
    expect(greeting(new Date("2026-10-05T15:00:00Z"))).toBe("Buen día"); // 10:00
    expect(greeting(new Date("2026-10-05T20:00:00Z"))).toBe("Buenas tardes"); // 15:00
    expect(greeting(new Date("2026-10-06T02:00:00Z"))).toBe("Buenas noches"); // 21:00
  });
});
