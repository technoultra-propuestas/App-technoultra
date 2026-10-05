import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AiDiagnosisCard } from "@/components/ai/AiDiagnosisCard";
import { QuoteDecision } from "./quote-client";
import {
  Card,
  fmtDate,
  fmtDateTime,
  money,
  MODALITY_LABEL,
  PageTitle,
  StatusBadge,
  statusLabel,
} from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Servicio", robots: { index: false } };

const MESSAGES: Record<string, string> = {
  received: "Ya tenemos tu equipo. Pronto empieza la revisión.",
  diagnosing: "Un técnico está revisando tu equipo para confirmar qué necesita.",
  awaiting_approval: "Revisa la cotización. No hacemos ningún trabajo sin tu aprobación.",
  awaiting_part: "Estamos esperando un repuesto para continuar.",
  in_service: "Estamos trabajando en tu equipo.",
  testing: "Estamos probando que todo funcione bien.",
  ready: "Tu equipo está listo. Coordinemos la entrega.",
  delivered: "Servicio finalizado. Tu garantía ya está activa.",
  cancelled: "Este servicio fue cancelado.",
};

export default async function TicketDetail({ params }: { params: Promise<{ id: string }> }) {
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
      "id, code, status, modality, problem, received_at, delivered_at, cancelled_reason, equipment(brand, model)",
    )
    .eq("id", id.data)
    .maybeSingle();
  if (!t) notFound();
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
    .select("id, code, status, valid_until, total, needs_part")
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
      <PageTitle
        title={t.code}
        subtitle={eq ? `${eq.brand} ${eq.model} · ${MODALITY_LABEL[t.modality]}` : MODALITY_LABEL[t.modality]}
      />
      <Card className="flex flex-col gap-3">
        <StatusBadge status={t.status} />
        <p className="m-0 text-[16px] font-semibold leading-snug">{MESSAGES[t.status]}</p>
        {t.cancelled_reason ? <p className="m-0 text-[14px] text-muted">{t.cancelled_reason}</p> : null}
      </Card>
      <Card className="flex flex-col gap-2">
        <h2 className="m-0 text-[17px] font-extrabold">Lo que nos contaste</h2>
        <p className="m-0 text-[15px] leading-normal text-ink-2">{t.problem}</p>
      </Card>
      {ai ? <AiDiagnosisCard row={ai} audience="client" /> : null}
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
          <div className="flex justify-between border-t border-line pt-3 text-[18px] font-extrabold">
            <span>Total</span>
            <span>{money(quote.total)}</span>
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
      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-[17px] font-extrabold">Historial</h2>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {(history ?? []).map((h) => (
            <li key={h.id} className="flex items-start justify-between gap-3 text-[15px] font-semibold">
              <span>{statusLabel(h.to_status)}</span>
              <span className="text-[13px] text-muted">{fmtDateTime(h.created_at)}</span>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
