import { describe, expect, it } from "vitest";
import { deliveryOutlook, deliverySnapshot, modalityOptions, type Zone } from "@/lib/domain/delivery";

const cali: Zone = { dane: "76001", city: "Cali", covered: { store: true, pickup: true, home: true }, homeFee: 10000, pickupFee: 0 };
const sinTarifa: Zone = { dane: "76520", city: "Palmira", covered: { store: true, pickup: true, home: true }, homeFee: 0, pickupFee: 0 };
const fuera: Zone = { dane: "00000", city: "Bogotá", covered: { store: false, pickup: false, home: false }, homeFee: 0, pickupFee: 0 };

describe("modalidades: «local» y «domicilio» siempre visibles; la no disponible se explica", () => {
  it("servicio que admite local y domicilio: ambas habilitadas", () => {
    const o = modalityOptions(["store", "home"]);
    expect(o.map((x) => [x.value, x.enabled])).toEqual([["store", true], ["home", true]]);
  });
  it("servicio solo-local (p. ej. «Mantenimiento PC gamer»): domicilio deshabilitado con el motivo, sin inventar disponibilidad", () => {
    const o = modalityOptions(["store"]);
    expect(o.find((x) => x.value === "home")).toMatchObject({ enabled: false, label: "Servicio a domicilio", reason: "Este servicio no se presta a domicilio: solo en el local." });
    expect(o.find((x) => x.value === "store")?.enabled).toBe(true);
  });
  it("servicio solo a domicilio: el local aparece deshabilitado; remoto y recogida solo si el servicio los admite", () => {
    const o = modalityOptions(["home"]);
    expect(o.find((x) => x.value === "store")).toMatchObject({ enabled: false });
    expect(o.some((x) => x.value === "remote" || x.value === "pickup")).toBe(false);
    const r = modalityOptions(["remote", "store"]);
    expect(r.map((x) => x.value)).toEqual(["store", "home", "remote"]);
    expect(r.find((x) => x.value === "home")?.enabled).toBe(false);
  });
});

describe("domicilio del servicio técnico: valor de la zona, concepto aparte y sin inventar", () => {
  it("modalidades sin cargo de desplazamiento no muestran nada", () => {
    expect(deliveryOutlook("remote", cali).kind).toBe("none");
    expect(deliveryOutlook("store", cali).kind).toBe("none");
  });
  it("con tarifa configurada: muestra el valor y que se cobra aparte (no incluido en el servicio)", () => {
    const o = deliveryOutlook("home", cali);
    expect(o).toMatchObject({ kind: "fee", fee: 10000 });
    expect(o.text).toMatch(/Cali: \$10\.000/);
    expect(o.text).toMatch(/aparte/);
    expect(deliveryOutlook("home", { ...cali, homeFee: 25000 }).fee).toBe(25000);
  });
  it("sin tarifa configurada (0): NO inventa un valor ni dice «gratis»; avisa que se confirma antes de aceptar", () => {
    const o = deliveryOutlook("home", sinTarifa);
    expect(o.kind).toBe("fee_missing");
    expect(o.text).toMatch(/confirmaremos antes de que aceptes/);
    expect(o.text).not.toMatch(/gratis|sin costo|\$0/i);
  });
  it("fuera de cobertura: lo dice (domicilio y local) y no habilita el servicio", () => {
    expect(deliveryOutlook("home", fuera).kind).toBe("uncovered");
    expect(deliveryOutlook("store", fuera).kind).toBe("uncovered");
    expect(deliveryOutlook("pickup", fuera).kind).toBe("uncovered");
  });
  it("sin dirección elegida pide elegirla; la recogida puede ser gratuita (0 = sin costo) o tener tarifa", () => {
    expect(deliveryOutlook("home", null).kind).toBe("no_address");
    expect(deliveryOutlook("pickup", cali).kind).toBe("free");
    expect(deliveryOutlook("pickup", { ...cali, pickupFee: 8000 })).toMatchObject({ kind: "fee", fee: 8000 });
  });
  it("el registro en la solicitud lleva el valor estimado calculado en servidor (null si no hay tarifa) y su origen", () => {
    expect(deliverySnapshot("home", cali)).toMatchObject({ modality: "home", dane_code: "76001", city: "Cali", fee: 10000, fee_configured: true, source: "coverage_areas" });
    expect(deliverySnapshot("home", sinTarifa)).toMatchObject({ fee: null, fee_configured: false });
    expect(deliverySnapshot("pickup", cali)).toMatchObject({ fee: 0, fee_configured: true });
  });
});
