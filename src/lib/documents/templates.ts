import { PdfBuilder, type PdfMeta } from "./pdf";
import { quoteBreakdown, type QuotePricing } from "@/lib/domain/pricing";
import { creditExplanation, groupQuoteItems } from "@/lib/quotes/concepts";

export type Party = { name: string; phone?: string | null; email?: string | null };
export type EquipmentInfo = { type: string; brand: string; model: string; serial?: string | null } | null;

const EQUIPMENT: Record<string, string> = { laptop: "Portátil", desktop: "Escritorio", all_in_one: "Todo en uno", printer: "Impresora", network: "Red / router", other: "Otro" };
const MODALITY: Record<string, string> = { store: "Llevar al local", pickup: "Recogida a domicilio", home: "Servicio a domicilio", remote: "Soporte remoto" };
const COP = (n: number | string) => "$" + Math.round(Number(n)).toLocaleString("es-CO");
const day = (d: string | Date) => new Date(d).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" });
const eq = (e: EquipmentInfo) => (e ? `${EQUIPMENT[e.type] ?? e.type} ${e.brand} ${e.model}${e.serial ? ` (serial ${e.serial})` : ""}` : "Sin equipo");

const parties = (b: PdfBuilder, c: Party, e: EquipmentInfo, ticket: string) => {
  b.section("Datos del servicio");
  b.kv([
    ["Ticket", ticket],
    ["Cliente", c.name],
    ["Celular", c.phone],
    ["Correo", c.email],
    ["Equipo", eq(e)],
  ]);
};

export type ReceptionData = {
  ticketCode: string; receivedAt: string; modality: string; customer: Party; equipment: EquipmentInfo;
  accessories: string[]; damage: string[]; physicalCondition?: string | null; reason: string; observations?: string | null;
  photoSlots: string[]; receivedBy?: string | null;
};
export async function buildReceptionPdf(d: ReceptionData, meta: PdfMeta) {
  const b = await PdfBuilder.create(meta);
  parties(b, d.customer, d.equipment, d.ticketCode);
  b.section("Recepción");
  b.kv([
    ["Fecha de recepción", day(d.receivedAt)],
    ["Modalidad", MODALITY[d.modality] ?? d.modality],
    ["Motivo de ingreso", d.reason],
    ["Accesorios recibidos", d.accessories.join(", ") || "Ninguno"],
    ["Daños visibles", d.damage.join(", ") || "Ninguno reportado"],
    ["Estado físico", d.physicalCondition],
    ["Observaciones", d.observations],
    ["Fotografías registradas", d.photoSlots.length ? `${d.photoSlots.length} (${d.photoSlots.join(", ")})` : "Ninguna"],
    ["Recibido por", d.receivedBy],
  ]);
  b.note("Este documento deja constancia del estado en que se recibió el equipo. Al firmarlo, el cliente confirma que la información es correcta. El diagnóstico y cualquier trabajo se informan por separado y requieren su aprobación.");
  return b.finish();
}

export type DiagnosisData = {
  ticketCode: string; customer: Party; equipment: EquipmentInfo; summary: string; components: { component: string; state: string }[];
  tests?: string | null; recommendations?: string | null; parts?: string | null;
  problem?: string | null; technician?: string | null; issuedAt?: string | Date | null;
  ai?: { summary: string; disclaimer: string; validation: string } | null;
};
const STATE: Record<string, string> = { ok: "OK", review: "Revisar", fail: "Falla" };
const VALIDATION: Record<string, string> = { pending: "pendiente de validación técnica", validated: "validado por el técnico", edited: "ajustado por el técnico", rejected: "descartado por el técnico" };
export async function buildDiagnosisPdf(d: DiagnosisData, meta: PdfMeta) {
  const b = await PdfBuilder.create(meta);
  parties(b, d.customer, d.equipment, d.ticketCode);
  b.section("Revisión del equipo");
  b.kv([["Fecha del informe", d.issuedAt ? day(d.issuedAt) : null], ["Técnico", d.technician], ["Síntomas reportados", d.problem]]);
  b.section("Diagnóstico técnico");
  b.para(d.summary);
  if (d.components.length) b.table(["Componente", "Resultado"], d.components.map((c) => [c.component, STATE[c.state] ?? c.state]), [3, 1]);
  b.kv([["Pruebas realizadas", d.tests], ["Recomendaciones", d.recommendations], ["Repuestos sugeridos", d.parts]]);
  b.note("Este informe resume la revisión técnica del equipo. Ningún trabajo se realiza sin tu aprobación; si hace falta una reparación, recibirás una cotización para revisar.");
  if (d.ai) {
    b.section("Apoyo de inteligencia artificial");
    b.para(d.ai.summary);
    b.note(`${d.ai.disclaimer} Estado: ${VALIDATION[d.ai.validation] ?? d.ai.validation}.`);
  }
  return b.finish();
}

export type QuoteData = {
  ticketCode?: string | null; customer: Party; equipment: EquipmentInfo; validUntil?: string | null; notes?: string | null; terms?: string | null;
  items: { description: string; qty: number; unitPrice: number; discount: number; lineSubtotal: number; warrantyDays: number; warrantyKind: string; kind?: string; concept?: string | null }[];
  subtotal: number; discountTotal: number; taxTotal: number; total: number;
  pricing?: QuotePricing; // desglose con snapshots (urgencia, domicilio, abono, IVA informativo)
};
export async function buildQuotePdf(d: QuoteData, meta: PdfMeta) {
  const b = await PdfBuilder.create(meta);
  parties(b, d.customer, d.equipment, d.ticketCode ?? "-");
  // Mano de obra, repuestos, productos y otros conceptos por separado: la cuenta se entiende de un vistazo.
  const groups = groupQuoteItems(d.items.map((i, n) => ({ id: String(n), kind: i.kind ?? "custom", concept: i.concept ?? null, description: i.description, qty: i.qty, unit_price: i.unitPrice, line_subtotal: i.lineSubtotal, warranty_days: i.warrantyDays, i })));
  for (const g of groups) {
    b.section(`${g.label} · ${COP(g.subtotal)}`);
    b.table(
      ["Descripción", "Cant.", "Valor unit.", "Desc.", "Total", "Garantía"],
      g.items.map((x) => [x.i.description, String(x.i.qty), COP(x.i.unitPrice), x.i.discount > 0 ? COP(x.i.discount) : "-", COP(x.i.lineSubtotal), x.i.warrantyDays > 0 ? `${x.i.warrantyDays} d (${x.i.warrantyKind === "product" ? "producto" : "trabajo"})` : "-"]),
      [5, 1.2, 2, 1.5, 2, 2.4],
    );
  }
  b.section("Resumen");
  b.kv(
    d.pricing
      ? quoteBreakdown(d.pricing).map((l): [string, string] => [l.key === "total" ? "TOTAL" : l.label, `${l.sign === -1 ? "-" : ""}${COP(l.amount)}`])
      : [["Subtotal", COP(d.subtotal)], ["Descuentos", d.discountTotal > 0 ? `-${COP(d.discountTotal)}` : null], ["Impuestos", d.taxTotal > 0 ? COP(d.taxTotal) : null], ["TOTAL", COP(d.total)]],
  );
  const why = creditExplanation(Number(d.pricing?.diagnosis_credit ?? 0));
  if (why) b.note(why);
  b.kv([["Vigencia", d.validUntil ? `Hasta el ${day(d.validUntil)}` : null], ["Observaciones", d.notes], ["Condiciones", d.terms]]);
  b.note("No se realiza ningún trabajo sin la aprobación del cliente. Los valores corresponden al catálogo vigente al momento de emitir esta cotización.");
  return b.finish();
}

export type DeliveryData = {
  ticketCode: string; customer: Party; equipment: EquipmentInfo; deliveredAt: string; receivedBy: string; notes?: string | null;
  nextMaintenance?: string | null; warranties: { code: string; kind: string; description: string; start: string; end: string }[]; recommendations: string[];
};
export async function buildDeliveryPdf(d: DeliveryData, meta: PdfMeta) {
  const b = await PdfBuilder.create(meta);
  parties(b, d.customer, d.equipment, d.ticketCode);
  b.section("Entrega");
  b.kv([["Fecha de entrega", day(d.deliveredAt)], ["Recibe", d.receivedBy], ["Notas", d.notes], ["Próximo mantenimiento recomendado", d.nextMaintenance ? day(d.nextMaintenance) : null]]);
  if (d.warranties.length) {
    b.section("Garantías activas");
    b.table(["N.°", "Tipo", "Cobertura", "Desde", "Hasta"], d.warranties.map((w) => [w.code, w.kind === "product" ? "Producto" : "Mano de obra", w.description, day(w.start), day(w.end)]), [2, 1.6, 4, 2, 2]);
  }
  if (d.recommendations.length) {
    b.section("Recomendaciones de uso");
    d.recommendations.forEach((r) => b.para(`- ${r}`));
  }
  b.note("Al firmar, el cliente confirma que recibió el equipo, los accesorios entregados y que revisó su funcionamiento. Las garantías se rigen por las condiciones publicadas en el Centro Legal de TechnoUltra.");
  return b.finish();
}

export type WarrantyData = {
  kind: "product" | "labor"; ticketCode?: string | null; customer: Party;
  items: { code: string; description: string; serial?: string | null; start: string; end: string; coverage?: string | null; exclusions?: string | null }[];
};
export async function buildWarrantyPdf(d: WarrantyData, meta: PdfMeta) {
  const b = await PdfBuilder.create(meta);
  b.section(d.kind === "product" ? "Garantía de producto" : "Garantía de trabajo / mano de obra");
  b.kv([["Cliente", d.customer.name], ["Ticket", d.ticketCode]]);
  for (const w of d.items) {
    b.section(w.code);
    b.kv([["Concepto", w.description], ["Serial", w.serial], ["Inicio", day(w.start)], ["Vencimiento", day(w.end)], ["Cobertura", w.coverage], ["Exclusiones", w.exclusions]]);
  }
  b.note(d.kind === "product" ? "La garantía de producto cubre defectos de fabricación y es independiente de la garantía del trabajo realizado." : "La garantía de trabajo cubre la mano de obra del servicio realizado y es independiente de la garantía de los productos instalados.");
  return b.finish();
}
