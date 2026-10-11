import { describe, expect, it } from "vitest";
import { DIAGNOSIS_CONDITION, DIAGNOSIS_SCOPE } from "@/lib/domain/pricing";
import { derivePaymentUi, PAYMENT_LABEL, PAYMENT_MESSAGE, PAYMENT_UNKNOWN_MESSAGE, returnMessage, type DbPaymentStatus } from "@/lib/payments/state";

const row = (status: DbPaymentStatus, created_at = "2026-10-10T10:00:00Z", provider = "mercadopago") => ({ status, provider, created_at });

describe("estados del pago del diagnóstico (A–E)", () => {
  it("A · fallido: se puede intentar de nuevo, con mensaje claro y sin mencionar al proveedor", () => {
    expect(derivePaymentUi([row("rejected")], false)).toEqual({ state: "rejected", canPay: true, canResume: false });
    expect(PAYMENT_MESSAGE.rejected).toBe("No se pudo completar tu pago. Puedes intentarlo nuevamente.");
  });

  it("B · cancelado: estado propio, se puede reintentar y el texto no acusa un fallo", () => {
    expect(derivePaymentUi([row("cancelled")], false)).toEqual({ state: "cancelled", canPay: true, canResume: false });
    expect(PAYMENT_MESSAGE.cancelled).toMatch(/Cancelaste el pago/);
    expect(PAYMENT_MESSAGE.cancelled).not.toMatch(/falló|rechaz|error/i);
  });

  it("C · pendiente: no se ofrece pagar otra vez, no se muestra «fallido» y se dice que no hace falta volver a pagar", () => {
    expect(derivePaymentUi([row("pending")], false)).toEqual({ state: "validating", canPay: false, canResume: true });
    expect(PAYMENT_MESSAGE.validating).toMatch(/Estamos confirmando tu pago/);
    expect(PAYMENT_MESSAGE.validating).toMatch(/No necesitas volver a pagar/);
    expect(PAYMENT_MESSAGE.validating).not.toMatch(/fall|rechaz/i);
  });

  it("C · volver del pago con ?pago=fallo NO muestra «fallido» si la base de datos dice pendiente", () => {
    expect(returnMessage("fallo", "validating")).toBeNull();
    expect(returnMessage("exito", "validating")?.text).toBe(PAYMENT_MESSAGE.validating);
  });

  it("D · aprobado manda sobre cualquier intento fallido anterior o posterior y no deja pagar dos veces", () => {
    expect(derivePaymentUi([row("approved", "2026-10-10T09:00:00Z"), row("rejected", "2026-10-10T11:00:00Z")], false)).toEqual({ state: "confirmed", canPay: false, canResume: false });
    expect(derivePaymentUi([], true).state).toBe("confirmed"); // el crédito/ticket pagado es la fuente de verdad
    expect(returnMessage("exito", "confirmed")).toBeNull();
    expect(returnMessage("fallo", "confirmed")).toBeNull();
  });

  it("E · sin estado verificable: mensaje de «no pudimos verificar», sin afirmar que falló ni que se cobró", () => {
    expect(returnMessage("fallo")?.text).toBe(PAYMENT_UNKNOWN_MESSAGE);
    expect(PAYMENT_UNKNOWN_MESSAGE).toMatch(/No pudimos verificar el estado de tu pago/);
    expect(PAYMENT_UNKNOWN_MESSAGE).toMatch(/no vuelvas a pagar/);
    expect(PAYMENT_UNKNOWN_MESSAGE).not.toMatch(/falló|fallido|rechaz|se cobr/i);
  });

  it("un parámetro de URL arbitrario no inventa estados", () => {
    expect(returnMessage("approved")).toBeNull();
    expect(returnMessage("<script>")).toBeNull();
  });

  it("los textos no prometen plazos ni mencionan al proveedor", () => {
    const all = [...Object.values(PAYMENT_LABEL), ...Object.values(PAYMENT_MESSAGE), PAYMENT_UNKNOWN_MESSAGE, DIAGNOSIS_SCOPE, DIAGNOSIS_CONDITION].join(" ");
    expect(all).not.toMatch(/mercado/i);
    expect(all).not.toMatch(/\b\d+\s*(horas|minutos|d[ií]as)\b|hoy mismo|en breve|pronto/i);
  });

  it("el texto del diagnóstico coincide con la regla real de cobro (abono al total de la reparación; sin aprobación, no se abona)", () => {
    expect(DIAGNOSIS_CONDITION).toBe("Si apruebas la reparación, el valor del diagnóstico se abona al total de la reparación. Si no la apruebas, el diagnóstico se cobra y no se abona.");
    expect(DIAGNOSIS_SCOPE).not.toMatch(/mano de obra|reembols/i);
  });
});
