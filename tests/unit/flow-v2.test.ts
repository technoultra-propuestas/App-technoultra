import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientNextAction, staffNextAction, type ClientFacts, type FlowFacts } from "@/lib/domain/next-action";
import { derivePaymentUi } from "@/lib/payments/state";
import { manualPaymentProblem, MANUAL_METHODS, methodLabel, staffPaymentView, type StaffPaymentRow } from "@/lib/payments/staff";
import { creditExplanation, groupQuoteItems } from "@/lib/quotes/concepts";
import { buildProposal, proposalSubtotal, type CatalogService } from "@/lib/quotes/proposal";
import { quoteBreakdown } from "@/lib/domain/pricing";

const row = (o: Partial<StaffPaymentRow> = {}): StaffPaymentRow => ({ id: "p", status: "approved", provider: "mercadopago", method: null, amount: 39900, reference: null, note: null, approved_at: "2026-10-07T10:00:00Z", created_at: "2026-10-07T09:00:00Z", voucher_evidence_id: null, ...o });

describe("pagos · vista del personal", () => {
  it("Mercado Pago aprobado: confirmado y NO se ofrece registrar pago", () => {
    const v = staffPaymentView([row()], false);
    expect(v).toMatchObject({ state: "confirmed", canRegister: false });
    expect(methodLabel("mercadopago", null)).toBe("Mercado Pago");
  });
  it("el concepto liquidado manda aunque no se vea la fila del pago (crédito del diagnóstico)", () => {
    expect(staffPaymentView([], true)).toMatchObject({ state: "confirmed", canRegister: false });
  });
  it("pago en validación (en línea o transferencia): no se puede registrar a mano", () => {
    expect(staffPaymentView([row({ status: "pending" })], false)).toMatchObject({ state: "validating", canRegister: false, pendingIsManual: false });
    expect(staffPaymentView([row({ status: "pending", provider: "manual", method: "bank_transfer" })], false)).toMatchObject({ state: "validating", canRegister: false, pendingIsManual: true });
  });
  it("sin pago, rechazado, vencido o anulado: pendiente y se permite registrar", () => {
    for (const status of ["rejected", "expired", "cancelled"] as const) expect(staffPaymentView([row({ status })], false)).toMatchObject({ state: "none", canRegister: true });
    expect(staffPaymentView([], false)).toMatchObject({ state: "none", canRegister: true });
  });
  it("un pago reembolsado no vuelve a ofrecer «Pagar» ni registro manual", () => {
    expect(derivePaymentUi([row({ status: "refunded" })], false)).toMatchObject({ state: "refunded", canPay: false });
  });
  it("cliente ya pagó: nunca se ofrece pagar otra vez; una transferencia pendiente no ofrece «continuar» con el proveedor", () => {
    expect(derivePaymentUi([row()], false).canPay).toBe(false);
    expect(derivePaymentUi([row({ status: "pending", provider: "manual", method: "bank_transfer" })], false)).toMatchObject({ state: "validating", canPay: false, canResume: false });
    expect(derivePaymentUi([row({ status: "pending" })], false).canResume).toBe(true);
  });
  it("métodos: efectivo, datáfono, transferencia y otro; el datáfono exige comprobante", () => {
    expect(MANUAL_METHODS.map((m) => m.value)).toEqual(["cash", "datafono", "bank_transfer", "other"]);
    expect(manualPaymentProblem("datafono", null)).toMatch(/comprobante/i);
    expect(manualPaymentProblem("datafono", "ev-1")).toBeNull();
    expect(manualPaymentProblem("cash", null)).toBeNull();
    expect(manualPaymentProblem("bank_transfer", null)).toBeNull();
  });
});

const svc = (name: string, price: number | null, mode: CatalogService["price_mode"] = "fixed", extra: Partial<CatalogService> = {}): CatalogService => ({ id: `id-${name}`, name, price_mode: mode, base_price: price, ...extra });
const catalog = [svc("Limpieza profunda de equipo", 60000), svc("Cambio de pasta térmica", 35000), svc("Diagnóstico técnico", 39900, "fixed", { is_diagnostic_fee: true }), svc("Formateo e instalación de Windows", 80000, "from"), svc("Reparación de fuente de poder", null, "quote")];

describe("cotización · propuesta automática", () => {
  it("sobrecalentamiento propone limpieza profunda y pasta térmica con precios REALES del catálogo", () => {
    const p = buildProposal("El portátil se calienta mucho y el ventilador suena fuerte", catalog);
    expect(p.lines.map((l) => l.name)).toEqual(["Limpieza profunda de equipo", "Cambio de pasta térmica"]);
    expect(p.lines.map((l) => l.unitPrice)).toEqual([60000, 35000]);
    expect(p.lines[0].priority).toBe("required");
    expect(p.lines.every((l) => !l.review)).toBe(true);
    expect(proposalSubtotal(p.lines)).toBe(95000);
    expect(p.needs).toContain("Sobrecalentamiento");
  });
  it("nunca propone el cobro del diagnóstico como servicio", () => {
    const p = buildProposal("diagnóstico: calienta y se apaga solo", catalog);
    expect(p.lines.some((l) => l.name.includes("Diagnóstico"))).toBe(false);
  });
  it("no inventa servicios: lo que no está en el catálogo queda como «requiere revisión» y no suma", () => {
    const p = buildProposal("la pantalla rota y no da imagen", catalog);
    expect(p.lines).toHaveLength(0);
    expect(p.unmatched[0]).toMatchObject({ ruleId: "screen" });
    expect(proposalSubtotal(p.lines)).toBe(0);
  });
  it("precio «desde» y «a cotizar» requieren revisión; el «a cotizar» no trae precio", () => {
    const os = buildProposal("Windows no inicia", catalog);
    expect(os.lines[0]).toMatchObject({ name: "Formateo e instalación de Windows", unitPrice: 80000, review: true });
    const power = buildProposal("no enciende", catalog);
    expect(power.lines[0]).toMatchObject({ unitPrice: null, review: true });
    expect(proposalSubtotal(power.lines)).toBe(0);
  });
  it("sin síntomas reconocibles no propone nada", () => {
    const p = buildProposal("quiero que revisen mi equipo", catalog);
    expect(p.lines).toHaveLength(0);
    expect(p.unmatched).toHaveLength(0);
  });
  it("no repite un servicio que corresponde a varias necesidades", () => {
    const p = buildProposal("se calienta y está muy lento, necesita limpieza", [svc("Limpieza y optimización", 70000)]);
    expect(p.lines).toHaveLength(1);
  });
});

describe("cotización · conceptos y total", () => {
  const items = [
    { id: "1", kind: "service", concept: "labor", description: "Limpieza", qty: 1, unit_price: 60000, line_subtotal: 60000, warranty_days: 30 },
    { id: "2", kind: "custom", concept: "part", description: "Ventilador", qty: 1, unit_price: 120000, line_subtotal: 120000, warranty_days: 0 },
    { id: "3", kind: "service", concept: null, description: "Optimización", qty: 1, unit_price: 20000, line_subtotal: 20000, warranty_days: 0 },
  ];
  it("agrupa mano de obra y repuestos por separado, con subtotales", () => {
    const g = groupQuoteItems(items);
    expect(g.map((x) => x.concept)).toEqual(["labor", "part"]);
    expect(g[0].subtotal).toBe(80000); // la línea sin concepto de un servicio cuenta como mano de obra
    expect(g[1].subtotal).toBe(120000);
    expect(g[0].label).toBe("Mano de obra y servicios");
  });
  it("el crédito del diagnóstico se muestra y se explica (180.000 − 39.900 = 140.100)", () => {
    const lines = quoteBreakdown({ subtotal: 180000, discount_total: 0, tax_total: 0, diagnosis_credit: 39900, total: 140100 });
    expect(lines.map((l) => l.key)).toEqual(["subtotal", "credit", "total"]);
    expect(lines[1]).toMatchObject({ label: "Crédito por diagnóstico (ya lo pagaste)", amount: 39900, sign: -1 });
    expect(lines[2]).toMatchObject({ label: "Total a pagar", amount: 140100, strong: true });
    expect(creditExplanation(39900)).toMatch(/se descuenta del total/);
    expect(creditExplanation(0)).toBeNull();
  });
});

const facts = (o: Partial<FlowFacts> = {}): FlowFacts => ({ status: "received", modality: "store", hasReception: false, photosComplete: false, hasDiagnosis: false, diagnosisFinalized: false, quoteStatus: null, quoteItems: 0, payment: "confirmed", quotePayable: false, checklistDone: false, hasChecklist: false, hasDelivery: false, ...o });

describe("estados · próxima acción del técnico", () => {
  it("recorre el flujo con UNA acción por momento", () => {
    expect(staffNextAction(facts()).title).toBe("Recibir el equipo");
    expect(staffNextAction(facts({ hasReception: true })).title).toMatch(/fotos/i);
    expect(staffNextAction(facts({ status: "diagnosing" })).title).toBe("Registrar el diagnóstico");
    expect(staffNextAction(facts({ status: "diagnosing", hasDiagnosis: true })).title).toBe("Finalizar el diagnóstico");
    expect(staffNextAction(facts({ status: "diagnosing", hasDiagnosis: true, diagnosisFinalized: true })).title).toBe("Generar la propuesta");
    expect(staffNextAction(facts({ status: "diagnosing", hasDiagnosis: true, diagnosisFinalized: true, quoteStatus: "draft", quoteItems: 2 })).cta?.label).toBe("Ver cotización");
    const wait = staffNextAction(facts({ status: "awaiting_approval", quoteStatus: "sent" }));
    expect(wait).toMatchObject({ title: "Esperando aprobación del cliente", waiting: true });
    expect(staffNextAction(facts({ status: "awaiting_approval", quoteStatus: "clarification" })).title).toMatch(/pregunta/);
    expect(staffNextAction(facts({ status: "in_service", quoteStatus: "approved" })).cta?.label).toBe("Pasar a pruebas");
    expect(staffNextAction(facts({ status: "testing" })).title).toBe("Completar las pruebas");
    expect(staffNextAction(facts({ status: "testing", hasChecklist: true, checklistDone: true })).title).toBe("Marcar como listo");
    expect(staffNextAction(facts({ status: "ready" })).title).toBe("Registrar la entrega");
    expect(staffNextAction(facts({ status: "ready", hasDelivery: true })).title).toBe("Entregar el equipo");
    expect(staffNextAction(facts({ status: "delivered" })).waiting).toBe(true);
  });
  it("no se marca «listo» sin pruebas ni se pasa de diagnóstico sin recepción completa", () => {
    expect(staffNextAction(facts({ status: "testing", hasChecklist: true, checklistDone: false })).title).not.toBe("Marcar como listo");
    expect(staffNextAction(facts({ status: "received", hasReception: true, photosComplete: false })).cta?.anchor).toBe("recepcion");
  });
  it("soporte remoto no habla de recibir equipo", () => {
    expect(staffNextAction(facts({ modality: "remote" })).title).toBe("Iniciar el soporte remoto");
  });
});

const cf = (o: Partial<ClientFacts> = {}): ClientFacts => ({ ...facts(), ticketId: "t1", diagnosisDocId: null, quoteDocId: null, diagnosisPayable: false, ...o });

describe("estados · «Ahora estamos aquí» del cliente", () => {
  it("pago confirmado + equipo pendiente: dice qué falta y NO ofrece pagar", () => {
    const n = clientNextAction(cf({ status: "received", payment: "confirmed", modality: "pickup", diagnosisPayable: true }));
    expect(n.title).toBe("Pendiente de recibir tu equipo");
    expect(n.body).toMatch(/coordinar[áa]? contigo la recogida/i);
    expect(n.primary).toBeUndefined();
  });
  it("cada modalidad da su mensaje", () => {
    expect(clientNextAction(cf({ modality: "home" })).body).toMatch(/técnico se pondrá en contacto contigo para coordinar la visita/);
    expect(clientNextAction(cf({ modality: "store" })).body).toMatch(/entregar el equipo en el punto acordado/);
    const remote = clientNextAction(cf({ modality: "remote" }));
    expect(remote.body).toMatch(/no necesitas entregar/);
    expect(remote.body).not.toMatch(/recogida|punto acordado/);
  });
  it("pago pendiente: UNA acción «Pagar»; en validación: sin botón y sin nombrar al proveedor", () => {
    const pay = clientNextAction(cf({ payment: "none", diagnosisPayable: true }));
    expect(pay.primary?.label).toBe("Pagar");
    const val = clientNextAction(cf({ payment: "validating" }));
    expect(val.primary).toBeUndefined();
    expect(JSON.stringify(val)).not.toMatch(/mercado/i);
    expect(val.title).toBe("Estamos validando tu pago");
  });
  it("diagnóstico listo → «Ver diagnóstico»; cotización → «Ver cotización»; listo → «Coordinar entrega»", () => {
    expect(clientNextAction(cf({ status: "diagnosing", diagnosisFinalized: true, diagnosisDocId: "d1" })).primary).toEqual({ label: "Ver diagnóstico", href: "/c/documentos/d1" });
    expect(clientNextAction(cf({ status: "diagnosing" })).title).toBe("Tu equipo está en diagnóstico");
    const q = clientNextAction(cf({ status: "awaiting_approval", quoteStatus: "sent", quoteDocId: "q1" }));
    expect(q.primary).toEqual({ label: "Ver cotización", href: "/c/tickets/t1/cotizacion" });
    expect(clientNextAction(cf({ status: "ready", deliveryHref: "https://wa.me/1" })).primary?.label).toBe("Coordinar entrega");
    expect(clientNextAction(cf({ status: "ready" })).primary).toBeUndefined();
  });
  it("aprobada con saldo pendiente → pagar el saldo; sin saldo → solo esperar", () => {
    expect(clientNextAction(cf({ status: "in_service", quotePayable: true })).primary?.label).toBe("Pagar");
    expect(clientNextAction(cf({ status: "in_service", quotePayable: false })).primary).toBeUndefined();
  });
  it("«Recibido» no se usa para la solicitud recién creada", () => {
    for (const status of ["received", "diagnosing", "awaiting_approval", "ready"]) {
      const n = clientNextAction(cf({ status, quoteStatus: "sent", quoteDocId: "q" }));
      expect(`${n.title} ${n.body}`).not.toMatch(/\brecibido\b/i);
    }
  });
});

describe("navegación · el Shop vive dentro de la app del cliente", () => {
  const src = (p: string) => readFileSync(path.resolve(__dirname, "../..", p), "utf8");
  it("el menú del cliente incluye Shop y el Shop usa el shell con BottomNav para clientes", () => {
    const shell = src("src/components/ui/ClientShell.tsx");
    expect(shell).toMatch(/label: "Shop"/);
    expect(shell).toMatch(/<BottomNav/);
    const shop = src("src/components/shop/ShopShell.tsx");
    expect(shop).toMatch(/profile\.role === "client"/);
    expect(shop).toMatch(/<ClientShell/);
    expect(shop).toMatch(/<SiteShell/); // visitantes y personal conservan la estructura pública
  });
  it("el Shop tiene UN solo shell (layout) y ninguna página lo duplica", () => {
    expect(src("src/app/tienda/layout.tsx")).toMatch(/<ShopShell>/);
    for (const p of ["src/app/tienda/(catalogo)/page.tsx", "src/app/tienda/carrito/page.tsx", "src/app/tienda/producto/[slug]/page.tsx", "src/app/tienda/categoria/[slug]/(lista)/page.tsx", "src/app/tienda/categoria/[slug]/[sub]/page.tsx"]) {
      const s = src(p);
      expect(s, p).not.toMatch(/<ShopShell/);
      expect(s, p).not.toMatch(/<SiteShell/);
    }
  });
  it("hay esqueletos de carga del Shop dentro del shell (respuesta visual inmediata al navegar)", () => {
    expect(src("src/components/shop/ShopSkeletons.tsx")).toMatch(/role="status"/);
    expect(src("src/app/tienda/(catalogo)/loading.tsx")).toMatch(/ShopListSkeleton/);
    expect(src("src/app/tienda/producto/[slug]/loading.tsx")).toMatch(/ShopProductSkeleton/);
    // la existencia se valida en el layout (antes del esqueleto) para que un recurso inexistente responda 404 HTTP real
    expect(src("src/app/tienda/producto/[slug]/layout.tsx")).toMatch(/notFound\(\)/);
    expect(src("src/app/tienda/categoria/[slug]/layout.tsx")).toMatch(/notFound\(\)/);
    expect(src("src/app/tienda/categoria/[slug]/[sub]/layout.tsx")).toMatch(/notFound\(\)/);
  });
});

describe("documentos PDF · cotización agrupada y diagnóstico técnico", () => {
  const meta = { title: "Documento", code: "DOC-1", version: 1, generatedAt: new Date("2026-10-07T12:00:00Z") };
  const party = { name: "Cliente Prueba", phone: "3000000000", email: "c@example.com" };
  const equipment = { type: "laptop", brand: "HP", model: "Pavilion", serial: "SN123" };
  it("la cotización se genera con mano de obra, repuestos y crédito del diagnóstico", async () => {
    const { buildQuotePdf } = await import("@/lib/documents/templates");
    const pdf = await buildQuotePdf(
      {
        ticketCode: "TKT-1", customer: party, equipment, validUntil: "2026-10-20", total: 140100, subtotal: 180000, discountTotal: 0, taxTotal: 0,
        items: [
          { kind: "service", concept: "labor", description: "Limpieza profunda", qty: 1, unitPrice: 60000, discount: 0, lineSubtotal: 60000, warrantyDays: 30, warrantyKind: "labor" },
          { kind: "custom", concept: "part", description: "Ventilador", qty: 1, unitPrice: 120000, discount: 0, lineSubtotal: 120000, warrantyDays: 0, warrantyKind: "labor" },
        ],
        pricing: { subtotal: 180000, discount_total: 0, tax_total: 0, diagnosis_credit: 39900, total: 140100 },
      },
      meta,
    );
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1500);
  });
  it("el diagnóstico técnico incluye síntomas, técnico, fecha y aviso", async () => {
    const { buildDiagnosisPdf } = await import("@/lib/documents/templates");
    const pdf = await buildDiagnosisPdf({ ticketCode: "TKT-1", customer: party, equipment, summary: "Ventilador obstruido", components: [{ component: "Ventilador", state: "fail" }], problem: "Se calienta", technician: "Técnico Uno", issuedAt: new Date("2026-10-07T12:00:00Z"), recommendations: "Limpieza" }, meta);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });
});
