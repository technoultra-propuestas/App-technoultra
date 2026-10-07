import { TextLink } from "@/components/ui/kit";
import { Panel, ProgressSteps, StatusHero, StatusRow, Timeline } from "@/components/ui/detail";
import { effectiveStatus, equipmentWhere, progressSteps, ticketMessage } from "@/lib/domain/ticket-flow";
import { PAYMENT_LABEL } from "@/lib/payments/state";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AiDiagnosisCard, type AiRow } from "@/components/ai/AiDiagnosisCard";
import { quoteBreakdown } from "@/lib/domain/pricing";
import { PaymentCard } from "./payment-card";
import { QuoteDecision } from "./quote-client";
import {
  Card,
  fmtDate,
  fmtDateTime,
  money,
  MODALITY_LABEL,
  statusLabel,
} from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Servicio", robots: { index: false } };


export default async function TicketDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pago?: string }> }) {
  await requireRole(["client"]);
  const id = z
    .string()
    .uuid()
    .safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  // RLS: solo el dueño obtiene la fila. Cambiar el id en la URL devuelve 404 (IDOR bloqueado).
  const { data: t } = await supabase
    .from("tickets")
    .select(
      "id, code, status, modality, problem, received_at, delivered_at, cancelled_reason, prepaid_at, equipment(brand, model)",
    )
    .eq("id", id.data)
    .maybeSingle();
  if (!t) notFound();
  const [{ count: receptions }, { data: pays }, { data: credit }] = await Promise.all([
    supabase.from("receptions").select("id", { count: "exact", head: true }).eq("ticket_id", t.id),
    supabase.from("payments").select("status").eq("ticket_id", t.id),
    supabase.from("diagnosis_credits").select("id").eq("ticket_id", t.id).maybeSingle(),
  ]);
  // «Equipo recibido» solo existe cuando TechnoUltra ya levantó el acta de recepción (tiene físicamente el equipo).
  const equipmentReceived = (receptions ?? 0) > 0;
  const view = effectiveStatus(t.status, equipmentReceived, t.modality);
  const flow = progressSteps(t.status, equipmentReceived, t.modality);
  const payConfirmed = Boolean(t.prepaid_at || credit || (pays ?? []).some((p) => p.status === "approved"));
  const payValidating = !payConfirmed && (pays ?? []).some((p) => p.status === "pending");
  const [{ data: history }, { data: notes }, { data: diag }] = await Promise.all([
    supabase
      .from("ticket_status_history")
      .select("id, to_status, reason, created_at")
      .eq("ticket_id", t.id)
      .order("created_at"),
    supabase
      .from("ticket_notes")
      .select("id, body, created_at")
      .eq("ticket_id", t.id)
      .eq("visibility", "customer")
      .order("created_at"),
    supabase
      .from("diagnostics")
      .select("id, summary, recommendations")
      .eq("ticket_id", t.id)
      .order("version", { ascending: false })
      .limit(1),
  ]);
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, code, status, valid_until, total, needs_part, subtotal, discount_total, tax_total, urgency_amount, urgency_snapshot, delivery_fee, delivery_snapshot, diagnosis_credit, vat_included, tax_snapshot")
    .eq("ticket_id", t.id)
    .neq("status", "superseded")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: qitems } = quote
    ? await supabase.from("quote_items").select("id, description, qty, line_subtotal, warranty_days").eq("quote_id", quote.id).order("position")
    : { data: [] as { id: string; description: string; qty: number; line_subtotal: number; warranty_days: number }[] };
  const { data: ai } = await supabase
    .from("ai_diagnostics")
    .select("id, output, urgency, disclaimer, validation_status, model")
    .eq("ticket_id", t.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const eq = t.equipment as unknown as { brand: string; model: string } | null;
  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <TextLink href="/c/tickets" className="w-fit">← Mis tickets</TextLink>
      <StatusHero
        code={t.code}
        subtitle={eq ? `${eq.brand} ${eq.model} · ${MODALITY_LABEL[t.modality]}` : MODALITY_LABEL[t.modality]}
        status={view}
        message={t.cancelled_reason ? `${ticketMessage(view, t.modality)} ${t.cancelled_reason}` : ticketMessage(view, t.modality)}
        meta={`Solicitud creada el ${fmtDateTime(t.received_at)}`}
      />
      {flow ? (
        <Card>
          <ProgressSteps steps={flow.steps} current={flow.current} />
        </Card>
      ) : null}
      <Panel title="¿Cómo va tu servicio?" hint="Cada línea es independiente: el pago no cambia el estado de tu equipo.">
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          <StatusRow label="Solicitud" value="Registrada" tone="ok" />
          <StatusRow label="Pago" value={payConfirmed ? PAYMENT_LABEL.confirmed : payValidating ? PAYMENT_LABEL.validating : "Pendiente o no requerido por ahora"} tone={payConfirmed ? "ok" : payValidating ? "wait" : "neutral"} />
          <StatusRow label="Equipo" value={equipmentWhere(t.status, equipmentReceived, t.modality)} tone={t.modality === "remote" || equipmentReceived || ["delivered", "ready"].includes(t.status) ? "ok" : "wait"} />
          <StatusRow label="Diagnóstico" value={diag?.[0] ? "Listo" : t.status === "diagnosing" ? "En curso" : "Pendiente"} tone={diag?.[0] ? "ok" : t.status === "diagnosing" ? "wait" : "neutral"} />
          <StatusRow label="Servicio" value={["ready", "delivered"].includes(t.status) ? "Completado" : ["in_service", "testing", "awaiting_part"].includes(t.status) ? "En curso" : "Pendiente"} tone={["ready", "delivered"].includes(t.status) ? "ok" : ["in_service", "testing", "awaiting_part"].includes(t.status) ? "wait" : "neutral"} />
          <StatusRow label="Entrega" value={t.status === "delivered" ? "Entregado" : t.status === "ready" ? "Listo para entregar" : "Pendiente"} tone={t.status === "delivered" ? "ok" : t.status === "ready" ? "wait" : "neutral"} />
        </ul>
      </Panel>
      <Panel title="Lo que nos contaste">
        <p className="m-0 text-[15px] leading-normal text-ink-2">{t.problem}</p>
      </Panel>
      {ai ? <AiDiagnosisCard row={ai as unknown as AiRow} audience="client" /> : null}
      {quote ? (
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Cotización {quote.code}</h2>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {(qitems ?? []).map((i) => (
              <li key={i.id} className="flex justify-between gap-3 text-[15px]">
                <span>
                  {i.description} <span className="text-muted">× {Number(i.qty)}</span>
                  {i.warranty_days > 0 ? <span className="block text-[12px] text-muted">Garantía {i.warranty_days} días</span> : null}
                </span>
                <span className="font-extrabold">{money(i.line_subtotal)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1 border-t border-line pt-3 text-[14px] font-semibold">
            {quoteBreakdown(quote as unknown as Parameters<typeof quoteBreakdown>[0]).map((l) => (
              <div key={l.key} className={`flex justify-between ${l.strong ? "text-[18px] font-extrabold" : l.info ? "text-[13px] text-muted" : ""}`}>
                <span>{l.label}</span>
                <span>
                  {l.sign === -1 ? "−" : ""}
                  {money(l.amount)}
                </span>
              </div>
            ))}
          </div>
          {quote.valid_until ? <p className="m-0 text-[13px] text-muted">Vigente hasta {fmtDate(quote.valid_until)}</p> : null}
          {["sent", "clarification"].includes(quote.status) ? (
            <QuoteDecision ticketId={t.id} quoteId={quote.id} total={money(quote.total)} />
          ) : (
            <p className="m-0 text-[14px] font-bold text-muted">
              {quote.status === "approved" ? "Aprobaste esta cotización." : quote.status === "rejected" ? "Rechazaste esta cotización." : ""}
            </p>
          )}
        </Card>
      ) : null}
      <PaymentCard ticketId={t.id} result={(await searchParams).pago} />
      {diag?.[0] ? (
        <Card className="flex flex-col gap-2">
          <h2 className="m-0 text-[17px] font-extrabold">Diagnóstico</h2>
          <p className="m-0 text-[15px] leading-normal text-ink-2">{diag[0].summary}</p>
          {diag[0].recommendations ? (
            <p className="m-0 text-[14px] text-muted">{diag[0].recommendations}</p>
          ) : null}
        </Card>
      ) : null}
      {(notes ?? []).length > 0 ? (
        <Card className="flex flex-col gap-2">
          <h2 className="m-0 text-[17px] font-extrabold">Mensajes del equipo</h2>
          {(notes ?? []).map((n) => (
            <p key={n.id} className="m-0 text-[15px] leading-normal">
              {n.body} <span className="text-[13px] text-muted">· {fmtDateTime(n.created_at)}</span>
            </p>
          ))}
        </Card>
      ) : null}
      <Panel title="Historial">
        <Timeline items={[...(history ?? [])].reverse().map((h) => ({ id: h.id, title: statusLabel(h.to_status), at: h.created_at, detail: h.reason }))} />
      </Panel>
    </section>
  );
}
