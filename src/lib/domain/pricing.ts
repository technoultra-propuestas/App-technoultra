/**
 * Desglose de una cotización, SIEMPRE a partir de los valores guardados (con sus snapshots) y nunca de configuración vigente:
 * así cambiar tarifas, recargos o IVA después no altera lo que ya se cotizó.
 */
export type QuotePricing = {
  subtotal: number | string;
  discount_total: number | string;
  tax_total: number | string;
  urgency_amount?: number | string | null;
  urgency_snapshot?: { label?: string; percent?: number } | null;
  delivery_fee?: number | string | null;
  delivery_snapshot?: { city?: string } | null;
  diagnosis_credit?: number | string | null;
  vat_included?: number | string | null;
  tax_snapshot?: { responsible?: boolean; rate?: number } | null;
  total: number | string;
};

export type BreakdownLine = { key: string; label: string; amount: number; sign: 1 | -1; strong?: boolean; info?: boolean };

const n = (v: unknown) => Number(v ?? 0) || 0;

export function quoteBreakdown(q: QuotePricing): BreakdownLine[] {
  const lines: BreakdownLine[] = [{ key: "subtotal", label: "Subtotal", amount: n(q.subtotal), sign: 1 }];
  if (n(q.discount_total) > 0) lines.push({ key: "discount", label: "Descuentos", amount: n(q.discount_total), sign: -1 });
  if (n(q.tax_total) > 0) lines.push({ key: "tax", label: "Impuestos", amount: n(q.tax_total), sign: 1 });
  if (n(q.urgency_amount) > 0) {
    const s = q.urgency_snapshot;
    const pct = s?.percent && s.percent > 0 ? ` (${s.percent}%)` : "";
    lines.push({ key: "urgency", label: `Recargo por urgencia · ${s?.label ?? "urgencia"}${pct}`, amount: n(q.urgency_amount), sign: 1 });
  }
  if (n(q.delivery_fee) > 0) lines.push({ key: "delivery", label: `Domicilio${q.delivery_snapshot?.city ? ` · ${q.delivery_snapshot.city}` : ""}`, amount: n(q.delivery_fee), sign: 1 });
  if (n(q.diagnosis_credit) > 0) lines.push({ key: "credit", label: "Abono del diagnóstico ya pagado", amount: n(q.diagnosis_credit), sign: -1 });
  lines.push({ key: "total", label: "Total", amount: n(q.total), sign: 1, strong: true });
  // El IVA solo se informa (el precio ya es el final): únicamente si TechnoUltra es responsable de IVA.
  if (q.tax_snapshot?.responsible && n(q.vat_included) > 0) {
    lines.push({ key: "vat", label: `Incluye IVA (${q.tax_snapshot.rate ?? 19}%)`, amount: n(q.vat_included), sign: 1, info: true });
  }
  return lines;
}

/** Texto de la condición del diagnóstico, para mostrar ANTES de pagarlo. */
export const DIAGNOSIS_CONDITION =
  "Si apruebas la reparación, el valor del diagnóstico se abona al total de la reparación. Si no la apruebas, el diagnóstico se cobra y no se abona.";
