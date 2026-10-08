import "server-only";
import { PHOTO_SLOTS } from "@/lib/domain/reception";
import type { FlowFacts } from "@/lib/domain/next-action";
import { staffPaymentView, type StaffPaymentRow } from "@/lib/payments/staff";
import { createClient } from "@/lib/supabase/server";

/** Hechos del ticket verificados en el servidor (RLS del usuario). Los usan la «Próxima acción» del personal y la del cliente. */
export async function loadFlowFacts(ticketId: string): Promise<FlowFacts | null> {
  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("id, status, modality, service_id, prepaid_at").eq("id", ticketId).maybeSingle();
  if (!t) return null;
  const [{ count: receptions }, { data: ev }, { data: diag }, { data: quote }, { data: credit }, { data: run }, { count: deliveries }, { data: svc }] = await Promise.all([
    supabase.from("receptions").select("id", { count: "exact", head: true }).eq("ticket_id", ticketId),
    supabase.from("evidence").select("slot").eq("ticket_id", ticketId).eq("stage", "reception").is("deleted_at", null),
    supabase.from("diagnostics").select("id, finalized_at").eq("ticket_id", ticketId).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("quotes").select("id, status, paid_at, total").eq("ticket_id", ticketId).neq("status", "superseded").order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("diagnosis_credits").select("id").eq("ticket_id", ticketId).maybeSingle(),
    supabase.from("checklist_runs").select("id, completed_at").eq("ticket_id", ticketId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("deliveries").select("id", { count: "exact", head: true }).eq("ticket_id", ticketId),
    t.service_id ? supabase.from("services").select("is_diagnostic_fee").eq("id", t.service_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const { count: qitems } = quote ? await supabase.from("quote_items").select("id", { count: "exact", head: true }).eq("quote_id", quote.id) : { count: 0 };
  const have = new Set((ev ?? []).map((e) => e.slot));
  const { data: pays } = await supabase.from("payments").select("id, status, provider, method, amount, reference, note, approved_at, created_at, voucher_evidence_id, purpose").eq("ticket_id", ticketId);
  const isDiag = Boolean(svc?.is_diagnostic_fee);
  const diagRows = ((pays ?? []) as unknown as (StaffPaymentRow & { purpose: string })[]).filter((p) => p.purpose === (isDiag ? "diagnosis" : "service")).map((p) => ({ ...p, amount: Number(p.amount) }));
  const diagnosisPayment = isDiag ? staffPaymentView(diagRows, Boolean(credit)).state : t.prepaid_at || diagRows.length ? staffPaymentView(diagRows, Boolean(t.prepaid_at)).state : "not_required";
  return {
    status: t.status,
    modality: t.modality,
    hasReception: (receptions ?? 0) > 0,
    photosComplete: PHOTO_SLOTS.filter((s) => s.required).every((s) => have.has(s.slot)),
    hasDiagnosis: Boolean(diag),
    diagnosisFinalized: Boolean(diag?.finalized_at),
    quoteStatus: quote?.status ?? null,
    quoteItems: qitems ?? 0,
    payment: diagnosisPayment,
    quotePayable: quote?.status === "approved" && !quote.paid_at && Number(quote.total) > 0,
    checklistDone: Boolean(run?.completed_at),
    hasChecklist: Boolean(run),
    hasDelivery: (deliveries ?? 0) > 0,
  };
}
