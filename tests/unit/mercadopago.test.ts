import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applicationIdFromToken, cancelOrder, checkWebhookSignature, copAmount, createOrder, expirationDuration, fetchOrder, mapOrderStatus, ORDER_ID, verifyWebhookSignature } from "@/lib/payments/mercadopago";

const secret = "whsec_test_1234567890";
const sign = (dataId: string, reqId: string, ts: string, s = secret) =>
  `ts=${ts},v1=${createHmac("sha256", s).update(`id:${dataId};request-id:${reqId};ts:${ts};`).digest("hex")}`;
const now = 1_760_000_000_000;
const ts = String(now);
const OID = "ORD01M49SFQXVAVQGG19A6SF4GN05";

describe("firma del webhook (x-signature)", () => {
  it("acepta una firma válida con id de Order (alfanumérico → minúsculas)", () => {
    expect(verifyWebhookSignature({ xSignature: sign(OID.toLowerCase(), "req-1", ts), xRequestId: "req-1", dataId: OID, secret, nowMs: now })).toBe(true);
  });
  it("acepta también un id numérico", () => {
    expect(verifyWebhookSignature({ xSignature: sign("123456", "req-1", ts), xRequestId: "req-1", dataId: "123456", secret, nowMs: now })).toBe(true);
  });
  it("rechaza firma alterada, secreto distinto, id distinto o request-id distinto", () => {
    const good = sign(OID.toLowerCase(), "req-1", ts);
    expect(verifyWebhookSignature({ xSignature: good, xRequestId: "req-1", dataId: "ORD999999999999999", secret, nowMs: now })).toBe(false);
    expect(verifyWebhookSignature({ xSignature: good, xRequestId: "req-2", dataId: OID, secret, nowMs: now })).toBe(false);
    expect(verifyWebhookSignature({ xSignature: good, xRequestId: "req-1", dataId: OID, secret: "otro-secreto-123456", nowMs: now })).toBe(false);
    expect(verifyWebhookSignature({ xSignature: good.replace(/.$/, "0"), xRequestId: "req-1", dataId: OID, secret, nowMs: now })).toBe(false);
  });
  it("rechaza cabeceras ausentes o mal formadas y secreto vacío", () => {
    for (const x of [null, "", "garbage", "ts=abc,v1=zz", `ts=${ts}`, `v1=${"a".repeat(64)}`]) {
      expect(verifyWebhookSignature({ xSignature: x, xRequestId: "r", dataId: "1", secret, nowMs: now })).toBe(false);
    }
    expect(verifyWebhookSignature({ xSignature: sign("1", "r", ts), xRequestId: "r", dataId: null, secret, nowMs: now })).toBe(false);
    expect(verifyWebhookSignature({ xSignature: sign("1", "r", ts, ""), xRequestId: "r", dataId: "1", secret: "", nowMs: now })).toBe(false);
  });
  it("rechaza marcas de tiempo fuera de la ventana (repetición)", () => {
    const old = String(now - 3 * 24 * 3600_000);
    expect(verifyWebhookSignature({ xSignature: sign("1", "r", old), xRequestId: "r", dataId: "1", secret, nowMs: now })).toBe(false);
  });
});

describe("motivo del rechazo de la firma (para diagnóstico)", () => {
  const base = { xRequestId: "req-1", dataId: OID, secret, nowMs: now };
  it("distingue cabecera ausente, formato, marca de tiempo vencida, secreto distinto y válida", () => {
    expect(checkWebhookSignature({ ...base, xSignature: null }).reason).toBe("missing_header");
    expect(checkWebhookSignature({ ...base, xSignature: "x" }).reason).toBe("bad_format");
    expect(checkWebhookSignature({ ...base, xSignature: sign(OID.toLowerCase(), "req-1", String(now - 3 * 24 * 3600_000)) })).toMatchObject({ reason: "stale_timestamp", tsAgeSeconds: 3 * 24 * 3600 });
    expect(checkWebhookSignature({ ...base, xSignature: sign(OID.toLowerCase(), "req-1", ts, "otro-secreto-123456") }).reason).toBe("mismatch");
    expect(checkWebhookSignature({ ...base, dataId: null, xSignature: sign("x", "req-1", ts) }).reason).toBe("missing_data_id");
    expect(checkWebhookSignature({ ...base, xSignature: sign(OID.toLowerCase(), "req-1", ts) })).toMatchObject({ ok: true, reason: "ok" });
  });
  it("el resultado nunca incluye la firma ni el secreto", () => {
    expect(JSON.stringify(checkWebhookSignature({ ...base, xSignature: sign(OID.toLowerCase(), "req-1", ts, "otro") }))).not.toMatch(/whsec|v1=|[0-9a-f]{64}/);
  });
});

describe("estados de la Order → estados internos", () => {
  it("solo processed + accredited aprueba; lo desconocido es pendiente, nunca aprobado", () => {
    expect(mapOrderStatus("processed", "accredited")).toBe("approved");
    for (const [s, d] of [["processed", undefined], ["processed", "algo"], ["created", "created"], ["processing", "in_process"], ["processing", "pending_review_manual"], ["action_required", "waiting_capture"], ["nuevo", "x"], ["", ""], [undefined, undefined], ["PROCESSED", "ACCREDITED"]] as const) {
      expect(mapOrderStatus(s, d)).toBe("pending");
    }
  });
  it("mapea rechazo, cancelación, vencimiento y reembolsos", () => {
    expect(mapOrderStatus("failed", "processing_error")).toBe("rejected");
    expect(mapOrderStatus("canceled", "canceled")).toBe("cancelled");
    expect(mapOrderStatus("expired")).toBe("expired");
    expect(mapOrderStatus("refunded", "refunded")).toBe("refunded");
    expect(mapOrderStatus("processed", "refunded")).toBe("refunded");
  });
  it("un reembolso parcial no cambia el estado: el pago sigue aprobado", () => {
    expect(mapOrderStatus("processed", "partially_refunded")).toBe("approved");
  });
});

describe("importes y utilidades", () => {
  it("COP va como entero sin decimales; todo lo demás se rechaza", () => {
    expect(copAmount(30100)).toBe("30100");
    for (const bad of [0, -1, 30100.5, NaN, Infinity, 1e12]) expect(copAmount(bad)).toBeNull();
  });
  it("el id de aplicación sale del access token y los ids de Order se validan", () => {
    expect(applicationIdFromToken("APP_USR-6180208665021480-061515-abcdef-3474234217")).toBe("6180208665021480");
    expect(applicationIdFromToken("basura")).toBeNull();
    expect(ORDER_ID.test(OID)).toBe(true);
    for (const bad of ["123", "ord01M49SFQXVAVQGG19A6SF4GN05", "ORD", `${OID}/../x`, ""]) expect(ORDER_ID.test(bad)).toBe(false);
  });
  it("duración de expiración ISO 8601 (días enteros u horas, mínimo 1 h)", () => {
    const t = 1_000_000_000_000;
    expect(expirationDuration(new Date(t + 48 * 3600_000), t)).toBe("P2D");
    expect(expirationDuration(new Date(t + 5 * 3600_000), t)).toBe("PT5H");
    expect(expirationDuration(new Date(t + 60_000), t)).toBe("PT1H");
  });
});

describe("creación de la Order (Orders API)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const base = { externalReference: "pay-p1", idempotencyKey: "11111111-1111-4111-8111-111111111111", items: [{ title: "Cotización COT-1", quantity: 1, unit_price: 30100 }], totalAmount: 30100, description: "Cotización COT-1", payerEmail: "c@x.com", appUrl: "https://app.technoultra.com", backPath: "/c/tickets/t1", expiresAt: new Date(Date.now() + 48 * 3600_000) };
  const okBody = (over: Record<string, unknown> = {}) => ({ id: OID, external_reference: "pay-p1", total_amount: "30100", currency: "COP", checkout_url: `https://www.mercadopago.com.co/checkout/v1/redirect?order_id=${OID}`, ...over });
  const stub = (res: { status?: number; body?: unknown; headers?: Record<string, string> }) => {
    const f = vi.fn(async () => new Response(JSON.stringify(res.body ?? okBody()), { status: res.status ?? 201, headers: res.headers }));
    vi.stubGlobal("fetch", f);
    return f;
  };

  it("envía type online + processing_mode manual, X-Idempotency-Key, Bearer, total en texto y ruta de retorno solo informativa", async () => {
    const f = stub({});
    const o = await createOrder(base, "APP_USR-token");
    expect(o).toEqual({ id: OID, checkoutUrl: expect.stringContaining("mercadopago.com.co") });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/v1/orders");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer APP_USR-token");
    expect(h["X-Idempotency-Key"]).toBe(base.idempotencyKey);
    const b = JSON.parse(String(init.body));
    expect(b).toMatchObject({ type: "online", processing_mode: "manual", total_amount: "30100", external_reference: "pay-p1", expiration_time: "P2D" });
    expect(b.items).toEqual([{ title: "Cotización COT-1", quantity: 1, unit_price: "30100" }]);
    expect(b.config.online).toMatchObject({ success_url: "https://app.technoultra.com/c/tickets/t1?pago=exito", auto_return: "approved" });
  });
  it("no envía NADA si el total no es exactamente Σ(precio × cantidad) o hay decimales", async () => {
    const f = stub({});
    expect(await createOrder({ ...base, totalAmount: 30000 }, "t")).toBeNull();
    expect(await createOrder({ ...base, items: [{ title: "x", quantity: 1, unit_price: 100.5 }], totalAmount: 100.5 }, "t")).toBeNull();
    expect(await createOrder({ ...base, items: [{ title: "x", quantity: 0, unit_price: 100 }], totalAmount: 0 }, "t")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("descarta respuestas que no corresponden a lo pedido (referencia, total, moneda, dominio, id)", async () => {
    for (const over of [{ external_reference: "otro" }, { total_amount: "1000" }, { currency: "USD" }, { checkout_url: "https://evil.example/pay" }, { id: "no-es-order" }]) {
      stub({ body: okBody(over) });
      expect(await createOrder(base, "t")).toBeNull();
    }
  });
  it("falla de forma segura ante 400, 401, 409, 429, 500 y errores de red", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const status of [400, 401, 409, 429, 500]) {
      stub({ status, body: { errors: [{ code: "x" }] }, headers: { "retry-after": "5" } });
      expect(await createOrder(base, "t")).toBeNull();
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await createOrder(base, "t")).toBeNull();
    // el registro no contiene el token
    expect(JSON.stringify(err.mock.calls)).not.toMatch(/Bearer|APP_USR/);
    err.mockRestore();
  });
});

describe("consulta y cancelación", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("fetchOrder distingue: encontrada, no existe (404) y proveedor caído", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: OID, status: "created", total_amount: "1" }), { status: 200 })));
    expect(await fetchOrder(OID, "t")).toMatchObject({ id: OID });
    for (const st of [404, 400]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: st })));
      expect(await fetchOrder(OID, "t")).toBe("not_found");
    }
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await fetchOrder(OID, "t")).toBeNull();
    err.mockRestore();
    expect(await fetchOrder("../../etc", "t")).toBe("not_found"); // un id inválido no llega a la red
  });
  it("cancelOrder usa clave de idempotencia y nunca lanza", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await cancelOrder(OID, "t")).toBe(true);
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[0]).toContain(`/v1/orders/${OID}/cancel`);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("x"); }));
    expect(await cancelOrder(OID, "t")).toBe(false);
    expect(await cancelOrder("mal", "t")).toBe(false);
  });
});
