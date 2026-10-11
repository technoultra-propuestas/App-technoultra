import { describe, expect, it } from "vitest";
import { paymentSteps, serviceStages, whatsNext, type StageFacts } from "@/lib/domain/service-stages";

const dates = { request: "2026-10-10T10:00:00Z", payment: null, diagnosis: null, quote: null, repairDone: null, delivered: null };
const facts = (o: Partial<StageFacts> = {}): StageFacts => ({ status: "received", paymentApplies: true, paymentConfirmed: false, immediate: false, diagnosisFinalized: false, quoteStatus: null, dates, ...o });
const states = (f: StageFacts) => serviceStages(f).map((s) => `${s.key}:${s.state}`).join(" ");

describe("etapas del servicio (solo hechos verificados)", () => {
  it("recién creada: solicitud lista y el pago es la etapa actual; el resto pendiente", () => {
    expect(states(facts())).toBe("request:done payment:current diagnosis:pending quote:pending repair:pending delivery:pending");
  });
  it("iniciar un pago NO avanza nada: sin confirmación la etapa de pago sigue actual", () => {
    expect(states(facts({ paymentConfirmed: false }))).toContain("payment:current");
  });
  it("pago confirmado → la etapa actual pasa a diagnóstico", () => {
    expect(states(facts({ paymentConfirmed: true }))).toBe("request:done payment:done diagnosis:current quote:pending repair:pending delivery:pending");
  });
  it("cotización enviada: diagnóstico hecho y la cotización es la actual (no está aprobada todavía)", () => {
    expect(states(facts({ status: "awaiting_approval", paymentConfirmed: true, diagnosisFinalized: true, quoteStatus: "sent" }))).toBe("request:done payment:done diagnosis:done quote:current repair:pending delivery:pending");
  });
  it("en reparación y entregado", () => {
    expect(states(facts({ status: "in_service", paymentConfirmed: true, diagnosisFinalized: true, quoteStatus: "approved" }))).toBe("request:done payment:done diagnosis:done quote:done repair:current delivery:pending");
    expect(states(facts({ status: "delivered", paymentConfirmed: true, diagnosisFinalized: true, quoteStatus: "approved" }))).toBe("request:done payment:done diagnosis:done quote:done repair:done delivery:done");
  });
  it("servicio de pago inmediato: sin diagnóstico ni cotización; sin cobro: sin etapa de pago", () => {
    expect(serviceStages(facts({ immediate: true })).map((s) => s.key)).toEqual(["request", "payment", "repair", "delivery"]);
    expect(serviceStages(facts({ paymentApplies: false })).map((s) => s.key)).not.toContain("payment");
  });
  it("cancelado: ninguna etapa queda «actual»", () => {
    expect(serviceStages(facts({ status: "cancelled" })).some((s) => s.state === "current")).toBe(false);
  });
  it("las fechas solo aparecen en etapas completadas", () => {
    const st = serviceStages(facts({ paymentConfirmed: true, dates: { ...dates, payment: "2026-10-10T11:00:00Z" } }));
    expect(st.find((s) => s.key === "payment")?.at).toBe("2026-10-10T11:00:00Z");
    expect(st.find((s) => s.key === "diagnosis")?.at).toBeNull();
  });
});

describe("línea de tiempo del pago", () => {
  const s = (state: Parameters<typeof paymentSteps>[0], o?: { unverified?: boolean }) => paymentSteps(state, o).map((x) => `${x.label}:${x.state}`).join(" | ");
  it("en validación: iniciado listo, validación actual, confirmado pendiente", () => {
    expect(s("validating")).toBe("Pago iniciado:done | En validación:current | Confirmado:pending");
  });
  it("confirmado: las tres completas", () => expect(s("confirmed")).toBe("Pago iniciado:done | En validación:done | Confirmado:done"));
  it("fallido, cancelado y vencido: muestran el resultado real y «Confirmado» NO se alcanza", () => {
    for (const st of ["rejected", "cancelled", "expired"] as const) {
      const steps = paymentSteps(st);
      expect(steps[1].state).toBe("failed");
      expect(steps[2].state).toBe("pending");
    }
    expect(s("cancelled")).toContain("Cancelado:failed");
  });
  it("sin verificar: etapa neutral (ni fallida ni confirmada)", () => {
    expect(s("validating", { unverified: true })).toBe("Pago iniciado:done | Sin verificar:unknown | Confirmado:pending");
  });
});

describe("«¿Qué sigue?»", () => {
  const base = { ticketStatus: "received", modality: "store", hasReception: false, diagnosisReady: false, unverified: false };
  it("pendiente: no hay otra acción; con demora de verificación: no pagar de nuevo", () => {
    expect(whatsNext({ ...base, pay: "validating" })).toMatch(/No necesitas realizar otra acción/);
    expect(whatsNext({ ...base, pay: "validating", unverified: true })).toMatch(/No realices otro pago/);
  });
  it("confirmado según la modalidad y el avance real", () => {
    expect(whatsNext({ ...base, pay: "confirmed", modality: "home" })).toBe("Nuestro equipo coordinará contigo la visita.");
    expect(whatsNext({ ...base, pay: "confirmed" })).toBe("Te indicaremos cómo coordinar la entrega del equipo.");
    expect(whatsNext({ ...base, pay: "confirmed", ticketStatus: "diagnosing" })).toBe("Nuestro técnico está revisando tu equipo.");
    expect(whatsNext({ ...base, pay: "confirmed", ticketStatus: "awaiting_approval" })).toMatch(/Revisa la cotización/);
    expect(whatsNext({ ...base, pay: "confirmed", ticketStatus: "ready" })).toMatch(/listo para coordinar la entrega/);
  });
  it("sin pago o cancelado: nada que prometer", () => {
    expect(whatsNext({ ...base, pay: "none" })).toBeNull();
    expect(whatsNext({ ...base, pay: "confirmed", ticketStatus: "cancelled" })).toBeNull();
  });
  it("sin plazos prometidos", () => {
    const all = ["received", "diagnosing", "awaiting_approval", "in_service", "ready"].map((ticketStatus) => whatsNext({ ...base, pay: "confirmed", ticketStatus })).join(" ");
    expect(all).not.toMatch(/\b\d+\s*(horas|minutos|d[ií]as)\b|pronto/i);
  });
});
