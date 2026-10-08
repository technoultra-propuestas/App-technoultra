import { TextLink } from "@/components/ui/kit";
import { Panel, ProgressSteps, StatusHero, StatusRow, Timeline } from "@/components/ui/detail";
import { clientNextAction } from "@/lib/domain/next-action";
import { effectiveStatus, equipmentWhere, progressSteps, ticketMessage } from "@/lib/domain/ticket-flow";
import { PAYMENT_LABEL } from "@/lib/payments/state";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AiDiagnosisCard, type AiRow } from "@/components/ai/AiDiagnosisCard";
import { COMPATIBILITY_NOTE } from "@/lib/ai/product-hints";
import { findRelatedProducts } from "@/lib/ai/related-products";
import { WHATSAPP_NUMBER } from "@/lib/catalog/config";
import { PaymentCard } from "./payment-card";
import { Card, fmtDateTime, money, MODALITY_LABEL, statusLabel } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { loadFlowFacts } from "@/lib/tickets/facts";
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
    .select("id, code, status, modality, problem, received_at, delivered_at, cancelled_reason, prepaid_at, service_id, equipment(brand, model)")
    .eq("id", id.data)
    .maybeSingle();
  if (!t) notFound();
  const [{ count: receptions }, { data: pays }, { data: credit }, facts] = await Promise.all([
    supabase.from("receptions").select("id", { count: "exact", head: true }).eq("ticket_id", t.id),
    supabase.from("payments").select("status").eq("ticket_id", t.id),
    supabase.from("diagnosis_credits").select("id").eq("ticket_id", t.id).maybeSingle(),
    loadFlowFacts(t.id),
  ]);
  // «Equipo recibido» solo existe cuando TechnoUltra ya levantó el acta de recepción (tiene físicamente el equipo).
  const equipmentReceived = (receptions ?? 0) > 0;
  const view = effectiveStatus(t.status, equipmentReceived, t.modality);
  const flow = progressSteps(t.status, equipmentReceived, t.modality);
  const payConfirmed = Boolean(t.prepaid_at || credit || (pays ?? []).some((p) => p.status === "approved"));
  const payValidating = !payConfirmed && (pays ?? []).some((p) => p.status === "pending");
  const [{ data: history }, { data: notes }, { data: diag }, { data: svc }] = await Promise.all([
    supabase.from("ticket_status_history").select("id, to_status, reason, created_at").eq("ticket_id", t.id).order("created_at"),
    supabase.from("ticket_notes").select("id, body, created_at").eq("ticket_id", t.id).eq("visibility", "customer").order("created_at"),
    supabase.from("diagnostics").select("id, summary, recommendations, finalized_at").eq("ticket_id", t.id).order("version", { ascending: false }).limit(1),
    t.service_id ? supabase.from("services").select("is_diagnostic_fee").eq("id", t.service_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, code, status, valid_until, total, paid_at")
    .eq("ticket_id", t.id)
    .neq("status", "superseded")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  // PDFs vigentes para abrir en el visor (la versión anterior sin firmar queda «reemplazada»).
  const { data: docs } = await supabase.from("documents").select("id, doc_type, quote_id").eq("ticket_id", t.id).in("doc_type", ["diagnosis", "quote"]).neq("status", "superseded").order("version", { ascending: false });
  const diagnosisDocId = (docs ?? []).find((d) => d.doc_type === "diagnosis")?.id ?? null;
  const quoteDocId = (docs ?? []).find((d) => d.doc_type === "quote" && (!quote || d.quote_id === quote.id))?.id ?? null;
  const { data: ai } = await supabase.from("ai_diagnostics").select("id, output, urgency, disclaimer, validation_status, model").eq("ticket_id", t.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const eq = t.equipment as unknown as { brand: string; model: string } | null;
  const diag0 = diag?.[0] ?? null;
  const diagnosisPayable = Boolean(svc?.is_diagnostic_fee) && !payConfirmed;
  const now = facts
    ? clientNextAction({
        ...facts,
        // El estado de pago se recalcula aquí con lo que ve el cliente (RLS): el servidor ya lo confirmó o no.
        payment: payConfirmed ? "confirmed" : payValidating ? "validating" : facts.payment === "not_required" ? "not_required" : "none",
        diagnosisFinalized: Boolean(diag0?.finalized_at),
        ticketId: t.id,
        diagnosisDocId,
        quoteDocId,
        diagnosisPayable,
        deliveryHref: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hola TechnoUltra 👋 Quiero coordinar la entrega de mi equipo. Servicio ${t.code}.`)}`,
      })
    : null;
  // Productos del Shop SOLO si el diagnóstico ya fue emitido y hay evidencia en el texto (reglas explícitas; sin compatibilidad inventada).
  const related = diag0?.finalized_at ? await findRelatedProducts([t.problem, diag0.summary, diag0.recommendations].filter(Boolean).join("\n"), []).catch(() => []) : [];

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
      {now ? (
        <section aria-label="Ahora estamos aquí" className={`flex flex-col gap-2 rounded-card border p-5 ${now.tone === "action" ? "border-brand bg-[#FFF6E8]" : "border-line bg-white"}`}>
          <span className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-muted">Ahora estamos aquí</span>
          <h2 className="m-0 text-[20px] font-extrabold leading-tight">{now.title}</h2>
          <p className="m-0 text-[15px] leading-snug text-ink-2">{now.body}</p>
          {now.primary ? (
            now.primary.href.startsWith("http") ? (
              <a href={now.primary.href} target="_blank" rel="noreferrer" className="press mt-1 flex min-h-[58px] w-full items-center justify-center rounded-2xl bg-brand px-5 text-[17px] font-extrabold text-ink no-underline">{now.primary.label}</a>
            ) : (
              <Link href={now.primary.href} className="press mt-1 flex min-h-[58px] w-full items-center justify-center rounded-2xl bg-brand px-5 text-[17px] font-extrabold text-ink no-underline">{now.primary.label}</Link>
            )
          ) : null}
          {now.secondary ? (
            <Link href={now.secondary.href} className="flex min-h-11 items-center justify-center text-[14.5px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">{now.secondary.label}</Link>
          ) : null}
        </section>
      ) : null}
      <PaymentCard ticketId={t.id} result={(await searchParams).pago} />
      {quote && ["sent", "clarification", "approved", "rejected"].includes(quote.status) ? (
        <Card className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-[17px] font-extrabold">Cotización {quote.code}</h2>
            <span className="text-[20px] font-extrabold">{money(quote.total)}</span>
          </div>
          <p className="m-0 text-[14px] text-muted">
            {quote.status === "approved" ? "Aprobaste esta cotización." : quote.status === "rejected" ? "Rechazaste esta cotización." : quote.status === "clarification" ? "Enviaste una pregunta; te respondemos en la cotización." : "Incluye mano de obra y repuestos. Revísala y decide."}
          </p>
          <Link href={`/c/tickets/${t.id}/cotizacion`} className={`press flex min-h-12 w-full items-center justify-center rounded-2xl px-5 text-[15px] font-extrabold no-underline ${["sent", "clarification"].includes(quote.status) ? "bg-brand text-ink" : "border-[1.5px] border-line-strong bg-white text-ink"}`}>
            {["sent", "clarification"].includes(quote.status) ? "Revisar cotización" : "Ver cotización"}
          </Link>
        </Card>
      ) : null}
      {diag0?.finalized_at ? (
        <Card className="flex flex-col gap-2">
          <h2 className="m-0 text-[17px] font-extrabold">Diagnóstico técnico</h2>
          <p className="m-0 text-[15px] leading-normal text-ink-2">Ya tenemos listo el diagnóstico de tu equipo.</p>
          {diagnosisDocId ? (
            <Link href={`/c/documentos/${diagnosisDocId}`} className="press flex min-h-12 w-full items-center justify-center rounded-2xl border-[1.5px] border-line-strong bg-white px-5 text-[15px] font-extrabold text-ink no-underline">Ver diagnóstico</Link>
          ) : (
            <p className="m-0 text-[14px] text-muted">{diag0.summary}</p>
          )}
        </Card>
      ) : null}
      {related.length > 0 ? (
        <Card className="flex flex-col gap-2">
          <h2 className="m-0 text-[17px] font-extrabold">Productos recomendados</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {related.slice(0, 3).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-[14.5px]">
                <span className="min-w-0 font-bold">{p.name}</span>
                <Link href={`/tienda/producto/${p.slug}`} className="flex-none text-[14px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">Ver en Shop</Link>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12.5px] text-muted">{COMPATIBILITY_NOTE}</p>
        </Card>
      ) : null}
      <Panel title="¿Cómo va tu servicio?" hint="Cada línea es independiente: el pago no cambia el estado de tu equipo.">
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          <StatusRow label="Solicitud" value="Registrada" tone="ok" />
          <StatusRow label="Pago" value={payConfirmed ? PAYMENT_LABEL.confirmed : payValidating ? PAYMENT_LABEL.validating : "Pendiente o no requerido por ahora"} tone={payConfirmed ? "ok" : payValidating ? "wait" : "neutral"} />
          <StatusRow label="Equipo" value={equipmentWhere(t.status, equipmentReceived, t.modality)} tone={t.modality === "remote" || equipmentReceived || ["delivered", "ready"].includes(t.status) ? "ok" : "wait"} />
          <StatusRow label="Diagnóstico" value={diag0?.finalized_at ? "Listo" : t.status === "diagnosing" ? "En curso" : "Pendiente"} tone={diag0?.finalized_at ? "ok" : t.status === "diagnosing" ? "wait" : "neutral"} />
          <StatusRow label="Servicio" value={["ready", "delivered"].includes(t.status) ? "Completado" : ["in_service", "testing", "awaiting_part"].includes(t.status) ? "En curso" : "Pendiente"} tone={["ready", "delivered"].includes(t.status) ? "ok" : ["in_service", "testing", "awaiting_part"].includes(t.status) ? "wait" : "neutral"} />
          <StatusRow label="Entrega" value={t.status === "delivered" ? "Entregado" : t.status === "ready" ? "Listo para entregar" : "Pendiente"} tone={t.status === "delivered" ? "ok" : t.status === "ready" ? "wait" : "neutral"} />
        </ul>
      </Panel>
      <Panel title="Lo que nos contaste">
        <p className="m-0 text-[15px] leading-normal text-ink-2">{t.problem}</p>
      </Panel>
      {ai ? <AiDiagnosisCard row={ai as unknown as AiRow} audience="client" /> : null}
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
