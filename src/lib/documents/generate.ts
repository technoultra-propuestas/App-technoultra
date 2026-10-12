import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QuotePricing } from "@/lib/domain/pricing";
import { loadBusinessInfo } from "@/lib/seo";
import { signedThumbUrl } from "@/lib/cloudinary";
import {
  buildDeliveryPdf, buildDiagnosisPdf, buildQuotePdf, buildReceptionPdf, buildWarrantyPdf,
  type EquipmentInfo, type Party,
} from "./templates";

export const BUCKET = "documents";
export type DocKind = "reception" | "diagnosis" | "quote" | "delivery" | "warranty_product" | "warranty_labor";

const TITLES: Record<DocKind, string> = {
  reception: "Acta de recepción",
  diagnosis: "Informe de diagnóstico",
  quote: "Cotización",
  delivery: "Acta de entrega",
  warranty_product: "Garantía de producto",
  warranty_labor: "Garantía de trabajo",
};
/** Documentos que el cliente puede firmar desde la app. */
export const SIGNABLE: DocKind[] = ["reception", "quote", "delivery"];
export const docTitle = (k: string) => TITLES[k as DocKind] ?? "Documento";

export type GenResult = { ok: true; id: string; code: string } | { ok: false; error: string };

type TicketRow = {
  id: string; code: string; customer_id: string; received_at: string; modality: string; equipment_id: string | null; assigned_to: string | null;
  customers: { full_name: string; phone: string | null; email: string | null } | null;
  equipment: { type: string; brand: string; model: string; serial: string | null } | null;
};

const USE_RECOMMENDATIONS: Record<string, string[]> = {
  laptop: ["Usa el equipo sobre superficies firmes y no obstruyas las rejillas de ventilación.", "Mantén el sistema y los programas actualizados.", "Haz copias de seguridad de tu información con regularidad.", "Programa el próximo mantenimiento preventivo en la fecha recomendada."],
  desktop: ["Mantén la torre ventilada y alejada de la pared.", "Usa regulador de voltaje o UPS.", "Haz copias de seguridad de tu información con regularidad.", "Programa el próximo mantenimiento preventivo en la fecha recomendada."],
  printer: ["Imprime al menos una página por semana para evitar que se seque la tinta.", "Usa tinta y papel recomendados por el fabricante.", "No apagues la impresora desconectándola: usa el botón de encendido.", "Programa el próximo mantenimiento en la fecha recomendada."],
};
const genericRecs = ["Sigue las indicaciones del técnico y programa el próximo mantenimiento en la fecha recomendada."];

const SLOT_LABEL: Record<string, string> = { front: "Vista frontal y pantalla", back: "Parte posterior o tapa", left: "Laterales y puertos", damage: "Daños visibles o vista adicional", screen: "Pantalla", serial: "Serial", right: "Lateral derecho", charger: "Cargador", other: "Otra vista" };
const SLOT_ORDER = ["front", "back", "left", "damage", "screen", "right", "serial", "charger", "other"];

/** Fotografías de la recepción (máx. 9) como miniaturas JPG obtenidas con URL firmada y temporal; si Cloudinary no responde, esa foto queda «no disponible». */
async function receptionPhotos(rows: { slot: string | null; cloudinary_public_id: string }[]): Promise<{ label: string; bytes: Uint8Array | null }[]> {
  const sorted = [...rows].sort((a, b) => SLOT_ORDER.indexOf(a.slot ?? "other") - SLOT_ORDER.indexOf(b.slot ?? "other")).slice(0, 9);
  return Promise.all(
    sorted.map(async (e) => {
      const label = SLOT_LABEL[e.slot ?? "other"] ?? "Otra vista";
      try {
        const res = await fetch(signedThumbUrl(e.cloudinary_public_id), { signal: AbortSignal.timeout(15_000), cache: "no-store" });
        if (!res.ok) return { label, bytes: null };
        return { label, bytes: new Uint8Array(await res.arrayBuffer()) };
      } catch {
        return { label, bytes: null };
      }
    }),
  );
}

async function loadTicket(ticketId: string): Promise<TicketRow | null> {
  const { data } = await createAdminClient()
    .from("tickets")
    .select("id, code, customer_id, received_at, modality, equipment_id, assigned_to, customers(full_name, phone, email), equipment(type, brand, model, serial)")
    .eq("id", ticketId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as unknown as TicketRow) ?? null;
}
const party = (t: TicketRow): Party => ({ name: t.customers?.full_name ?? "Cliente", phone: t.customers?.phone, email: t.customers?.email });
const equip = (t: TicketRow): EquipmentInfo => (t.equipment ? { ...t.equipment } : null);

/**
 * Genera un documento a partir de DATOS REALES, lo guarda en un bucket privado con su SHA-256 y lo registra con versión.
 * El llamador debe haber verificado antes que el usuario puede gestionar el ticket (RLS/rol).
 */
export async function generateTicketDocument(kind: DocKind, ticketId: string, actorId: string | null): Promise<GenResult> {
  const admin = createAdminClient();
  const t = await loadTicket(ticketId);
  if (!t) return { ok: false, error: "Ticket no encontrado." };

  const { data: codeData, error: codeErr } = await admin.rpc("next_document_code");
  if (codeErr || !codeData) return { ok: false, error: "No pudimos numerar el documento." };
  const code = codeData as string;
  const { data: prev } = await admin.from("documents").select("id, version, status").eq("ticket_id", ticketId).eq("doc_type", kind).order("version", { ascending: false });
  const version = (prev?.[0]?.version ?? 0) + 1;
  const biz = await loadBusinessInfo();
  const meta = { title: TITLES[kind], code, version, generatedAt: new Date(), business: { name: biz.name, phone: biz.phone, address: biz.address } };
  let quoteId: string | null = null;
  let pdf: Uint8Array;

  if (kind === "reception") {
    const [{ data: r }, { data: ev }, { data: staff }] = await Promise.all([
      admin.from("receptions").select("accessories, visible_damage, physical_condition, reason, observations, received_by").eq("ticket_id", ticketId).maybeSingle(),
      admin.from("evidence").select("slot, cloudinary_public_id, media_kind").eq("ticket_id", ticketId).eq("stage", "reception").is("deleted_at", null).order("created_at"),
      t.assigned_to ? admin.from("profiles").select("full_name").eq("id", t.assigned_to).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!r) return { ok: false, error: "Primero registra la recepción del equipo." };
    // Quien registró la recepción (si es otra persona que la asignada) también se identifica.
    const { data: by } = r.received_by ? await admin.from("profiles").select("full_name").eq("id", r.received_by).maybeSingle() : { data: null };
    const photos = await receptionPhotos((ev ?? []).filter((e) => e.media_kind === "photo"));
    pdf = await buildReceptionPdf({ ticketCode: t.code, receivedAt: t.received_at, modality: t.modality, customer: party(t), equipment: equip(t), accessories: r.accessories, damage: r.visible_damage, physicalCondition: r.physical_condition, reason: r.reason, observations: r.observations, photoSlots: (ev ?? []).map((e) => e.slot ?? "otra"), receivedBy: (by as { full_name: string } | null)?.full_name ?? (staff as { full_name: string } | null)?.full_name, photos }, meta);
  } else if (kind === "diagnosis") {
    const { data: d } = await admin.from("diagnostics").select("id, summary, tests_performed, recommendations, suggested_parts, technician_id, finalized_at").eq("ticket_id", ticketId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (!d) return { ok: false, error: "Primero registra el diagnóstico." };
    const [{ data: items }, { data: ai }] = await Promise.all([
      admin.from("diagnostic_items").select("component, state").eq("diagnostic_id", d.id),
      admin.from("ai_diagnostics").select("output, disclaimer, validation_status").eq("ticket_id", ticketId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const [{ data: tech }, { data: tk }] = await Promise.all([
      d.technician_id ? admin.from("profiles").select("full_name").eq("id", d.technician_id).maybeSingle() : Promise.resolve({ data: null }),
      admin.from("tickets").select("problem").eq("id", ticketId).maybeSingle(),
    ]);
    pdf = await buildDiagnosisPdf({ ticketCode: t.code, customer: party(t), equipment: equip(t), problem: tk?.problem, technician: (tech as { full_name: string } | null)?.full_name, issuedAt: d.finalized_at ?? new Date(), summary: d.summary, components: items ?? [], tests: d.tests_performed, recommendations: d.recommendations, parts: d.suggested_parts, ai: ai ? { summary: (ai.output as { summary?: string }).summary ?? "", disclaimer: ai.disclaimer, validation: ai.validation_status } : null }, meta);
  } else if (kind === "quote") {
    const { data: q } = await admin.from("quotes").select("id, valid_until, notes, terms, subtotal, discount_total, tax_total, total, status, urgency_amount, urgency_snapshot, delivery_fee, delivery_snapshot, diagnosis_credit, vat_included, tax_snapshot").eq("ticket_id", ticketId).in("status", ["sent", "clarification", "approved"]).order("version", { ascending: false }).limit(1).maybeSingle();
    if (!q) return { ok: false, error: "No hay una cotización enviada para documentar." };
    quoteId = q.id;
    const { data: items } = await admin.from("quote_items").select("kind, concept, description, qty, unit_price, discount, line_subtotal, warranty_days, warranty_kind").eq("quote_id", q.id).order("position");
    pdf = await buildQuotePdf({ ticketCode: t.code, customer: party(t), equipment: equip(t), validUntil: q.valid_until, notes: q.notes, terms: q.terms, items: (items ?? []).map((i) => ({ kind: i.kind, concept: i.concept, description: i.description, qty: Number(i.qty), unitPrice: Number(i.unit_price), discount: Number(i.discount), lineSubtotal: Number(i.line_subtotal), warrantyDays: i.warranty_days, warrantyKind: i.warranty_kind })), subtotal: Number(q.subtotal), discountTotal: Number(q.discount_total), taxTotal: Number(q.tax_total), total: Number(q.total), pricing: q as unknown as QuotePricing }, meta);
  } else if (kind === "delivery") {
    const [{ data: dl }, { data: w }, { data: diag }] = await Promise.all([
      admin.from("deliveries").select("received_by_name, notes, next_maintenance_at, created_at").eq("ticket_id", ticketId).maybeSingle(),
      admin.from("warranties").select("code, kind, description, start_date, end_date").eq("ticket_id", ticketId).order("kind"),
      admin.from("diagnostics").select("recommendations").eq("ticket_id", ticketId).order("version", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!dl) return { ok: false, error: "Primero registra los datos de la entrega." };
    const recs = [...(USE_RECOMMENDATIONS[t.equipment?.type ?? ""] ?? genericRecs), ...(diag?.recommendations ? [diag.recommendations as string] : [])];
    pdf = await buildDeliveryPdf({ ticketCode: t.code, customer: party(t), equipment: equip(t), deliveredAt: dl.created_at, receivedBy: dl.received_by_name, notes: dl.notes, nextMaintenance: dl.next_maintenance_at, warranties: (w ?? []).map((x) => ({ code: x.code, kind: x.kind, description: x.description, start: x.start_date, end: x.end_date })), recommendations: recs }, meta);
  } else {
    const wk = kind === "warranty_product" ? "product" : "labor";
    const { data: w } = await admin.from("warranties").select("code, description, serial, start_date, end_date, coverage, exclusions").eq("ticket_id", ticketId).eq("kind", wk);
    if (!w?.length) return { ok: false, error: "No hay garantías de este tipo para documentar." };
    pdf = await buildWarrantyPdf({ kind: wk, ticketCode: t.code, customer: party(t), items: w.map((x) => ({ code: x.code, description: x.description, serial: x.serial, start: x.start_date, end: x.end_date, coverage: x.coverage, exclusions: x.exclusions })) }, meta);
  }

  const sha256 = createHash("sha256").update(pdf).digest("hex");
  const path = `tickets/${ticketId}/${code}-v${version}.pdf`;
  const up = await admin.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (up.error) {
    console.error("documents.upload", up.error.message);
    return { ok: false, error: "No pudimos guardar el documento." };
  }
  const { data: row, error } = await admin
    .from("documents")
    .insert({ code, doc_type: kind, version, status: "generated", title: TITLES[kind], customer_id: t.customer_id, ticket_id: ticketId, quote_id: quoteId, storage_path: path, sha256, generated_by: actorId, supersedes_id: prev?.[0]?.id ?? null })
    .select("id")
    .single();
  if (error || !row) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "No pudimos registrar el documento." };
  }
  // Las versiones anteriores sin firmar quedan reemplazadas; las firmadas se conservan intactas.
  const old = (prev ?? []).filter((p) => !["signed", "superseded"].includes(p.status)).map((p) => p.id);
  if (old.length) await admin.from("documents").update({ status: "superseded" }).in("id", old);

  // Aviso idempotente (y copia de supervisión) por la base de datos. El acta de recepción tiene su propio aviso («Firma el acta»).
  await admin.rpc("notify_document_available", { p_doc: row.id });
  return { ok: true, id: row.id, code };
}
