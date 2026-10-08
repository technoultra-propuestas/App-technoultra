/**
 * Conceptos de una cotización. La mano de obra es un concepto de primera clase: el cliente ve «Mano de obra», «Repuestos»,
 * «Productos» y «Otros» por separado, y después la cuenta (subtotal, crédito del diagnóstico, total a pagar).
 */
export type Concept = "labor" | "part" | "product" | "other";
export const CONCEPT_LABEL: Record<Concept, string> = { labor: "Mano de obra y servicios", part: "Repuestos", product: "Productos", other: "Otros conceptos" };
const ORDER: Concept[] = ["labor", "part", "product", "other"];

export type QuoteLine = { id: string; kind: string; concept: string | null; description: string; qty: number | string; unit_price: number | string; discount?: number | string; line_subtotal: number | string | null; warranty_days: number; priority?: string | null };

export function conceptOf(i: Pick<QuoteLine, "kind" | "concept">): Concept {
  if (i.concept === "labor" || i.concept === "part" || i.concept === "product" || i.concept === "other") return i.concept;
  return i.kind === "service" ? "labor" : i.kind === "product" ? "product" : "other";
}

export type ConceptGroup<T extends QuoteLine = QuoteLine> = { concept: Concept; label: string; items: T[]; subtotal: number };

/** Agrupa por concepto en orden fijo; los grupos vacíos no aparecen. El subtotal sale de `line_subtotal` (calculado por la BD). */
export function groupQuoteItems<T extends QuoteLine>(items: T[]): ConceptGroup<T>[] {
  return ORDER.map((c) => {
    const list = items.filter((i) => conceptOf(i) === c);
    return { concept: c, label: CONCEPT_LABEL[c], items: list, subtotal: list.reduce((s, i) => s + Number(i.line_subtotal ?? 0), 0) };
  }).filter((g) => g.items.length > 0);
}

/** Explica el crédito del diagnóstico con las cifras reales de la cotización (nada se esconde). */
export function creditExplanation(credit: number): string | null {
  if (!(credit > 0)) return null;
  return "El valor del diagnóstico ya pagado se descuenta del total porque apruebas la reparación.";
}
