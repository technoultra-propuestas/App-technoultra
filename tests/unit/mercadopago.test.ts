import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mapStatus, verifyWebhookSignature } from "@/lib/payments/mercadopago";

const secret = "whsec_test_1234567890";
const sign = (dataId: string, reqId: string, ts: string, s = secret) =>
  `ts=${ts},v1=${createHmac("sha256", s).update(`id:${dataId};request-id:${reqId};ts:${ts};`).digest("hex")}`;
const now = 1_760_000_000_000;
const ts = String(now);

describe("webhook de Mercado Pago", () => {
  it("acepta una firma válida", () => {
    expect(verifyWebhookSignature({ xSignature: sign("123456", "req-1", ts), xRequestId: "req-1", dataId: "123456", secret, nowMs: now })).toBe(true);
  });
  it("normaliza el id alfanumérico a minúsculas como exige el proveedor", () => {
    expect(verifyWebhookSignature({ xSignature: sign("abc123", "r", ts), xRequestId: "r", dataId: "ABC123", secret, nowMs: now })).toBe(true);
  });
  it("rechaza firma alterada, secreto distinto, id distinto o request-id distinto", () => {
    const good = sign("123456", "req-1", ts);
    expect(verifyWebhookSignature({ xSignature: good, xRequestId: "req-1", dataId: "999999", secret, nowMs: now })).toBe(false);
    expect(verifyWebhookSignature({ xSignature: good, xRequestId: "req-2", dataId: "123456", secret, nowMs: now })).toBe(false);
    expect(verifyWebhookSignature({ xSignature: good, xRequestId: "req-1", dataId: "123456", secret: "otro-secreto-123456", nowMs: now })).toBe(false);
    expect(verifyWebhookSignature({ xSignature: good.replace(/.$/, "0"), xRequestId: "req-1", dataId: "123456", secret, nowMs: now })).toBe(false);
  });
  it("rechaza cabeceras ausentes o mal formadas", () => {
    for (const x of [null, "", "garbage", "ts=abc,v1=zz", `ts=${ts}`, `v1=${"a".repeat(64)}`]) {
      expect(verifyWebhookSignature({ xSignature: x, xRequestId: "r", dataId: "1", secret, nowMs: now })).toBe(false);
    }
    expect(verifyWebhookSignature({ xSignature: sign("1", "r", ts), xRequestId: "r", dataId: null, secret, nowMs: now })).toBe(false);
  });
  it("rechaza marcas de tiempo fuera de la ventana (repetición)", () => {
    const old = String(now - 3 * 24 * 3600_000);
    expect(verifyWebhookSignature({ xSignature: sign("1", "r", old), xRequestId: "r", dataId: "1", secret, nowMs: now })).toBe(false);
  });
  it("un estado desconocido nunca se interpreta como aprobado", () => {
    expect(mapStatus("approved")).toBe("approved");
    for (const s of ["pending", "in_process", "authorized", "in_mediation", "algo_nuevo", "", undefined, null, "APPROVED"]) expect(mapStatus(s as string)).toBe("pending");
    expect(mapStatus("rejected")).toBe("rejected");
    expect(mapStatus("cancelled")).toBe("cancelled");
    expect(mapStatus("refunded")).toBe("refunded");
    expect(mapStatus("charged_back")).toBe("refunded");
  });
});
