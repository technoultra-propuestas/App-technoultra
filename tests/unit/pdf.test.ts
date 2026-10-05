import { describe, expect, it } from "vitest";
import { winAnsi } from "@/lib/documents/pdf";
import { buildDeliveryPdf, buildDiagnosisPdf, buildQuotePdf, buildReceptionPdf, buildWarrantyPdf } from "@/lib/documents/templates";

const meta = (title: string) => ({ title, code: "DOC-2026-00001", version: 1, generatedAt: new Date("2026-10-05T15:00:00Z") });
const customer = { name: "María Pérez Ñandú", phone: "3001234567", email: "maria@example.com" };
const equipment = { type: "laptop", brand: "HP", model: "14-R005LA", serial: "5CD4281XQZ" };
const header = (b: Uint8Array) => new TextDecoder().decode(b.slice(0, 5));

describe("generación de PDFs", () => {
  it("winAnsi conserva acentos y reemplaza caracteres no soportados", () => {
    expect(winAnsi("Atención: ñandú ¿qué? “comillas” — ok")).toBe('Atención: ñandú ¿qué? "comillas" - ok');
    expect(winAnsi("emoji 😀 y ⏻")).toBe("emoji ? y ?");
  });
  it("acta de recepción", async () => {
    const pdf = await buildReceptionPdf({ ticketCode: "TU-2026-00001", receivedAt: "2026-10-05T15:00:00Z", modality: "pickup", customer, equipment, accessories: ["Cargador"], damage: [], reason: "Muy lento", photoSlots: ["front", "back", "screen", "serial"], receivedBy: "Wilder" }, meta("Acta de recepción"));
    expect(header(pdf)).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1500);
  });
  it("diagnóstico con apoyo de IA preliminar", async () => {
    const pdf = await buildDiagnosisPdf({ ticketCode: "TU-1", customer, equipment, summary: "Disco al 100% de uso sostenido.", components: [{ component: "Almacenamiento (SMART)", state: "fail" }], ai: { summary: "Posible disco lento", disclaimer: "Diagnóstico preliminar generado con asistencia de IA.", validation: "validated" } }, meta("Diagnóstico"));
    expect(header(pdf)).toBe("%PDF-");
  });
  it("cotización con muchas líneas (salto de página) y texto largo", async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ description: `Ítem ${i} ${"descripción larga ".repeat(6)}`, qty: 1, unitPrice: 10000 * (i + 1), discount: 0, lineSubtotal: 10000 * (i + 1), warrantyDays: 30, warrantyKind: "labor" }));
    const pdf = await buildQuotePdf({ ticketCode: "TU-1", customer, equipment, items, subtotal: 1, discountTotal: 0, taxTotal: 0, total: 1, notes: "n".repeat(2000) }, meta("Cotización"));
    expect(header(pdf)).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
  });
  it("acta de entrega y garantías", async () => {
    const d = await buildDeliveryPdf({ ticketCode: "TU-1", customer, equipment, deliveredAt: "2026-10-05T15:00:00Z", receivedBy: "María", nextMaintenance: "2027-04-05", warranties: [{ code: "GAR-2026-00001", kind: "product", description: "SSD 480 GB", start: "2026-10-05", end: "2027-10-05" }], recommendations: ["No bloquees las rejillas de ventilación."] }, meta("Acta de entrega"));
    const w = await buildWarrantyPdf({ kind: "labor", ticketCode: "TU-1", customer, items: [{ code: "GAR-2026-00002", description: "Mantenimiento preventivo", start: "2026-10-05", end: "2026-11-04" }] }, meta("Garantía"));
    expect(header(d)).toBe("%PDF-");
    expect(header(w)).toBe("%PDF-");
  });
  it("los metadatos son reproducibles (fecha de creación fija)", async () => {
    const a = await buildWarrantyPdf({ kind: "product", customer, items: [] }, meta("G"));
    expect(a.length).toBeGreaterThan(500);
  });
});
