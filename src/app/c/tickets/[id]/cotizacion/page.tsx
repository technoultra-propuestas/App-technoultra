import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { TextLink } from "@/components/ui/kit";
import { fmtDate, fmtDateTime, money, MODALITY_LABEL } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { quoteBreakdown } from "@/lib/domain/pricing";
import { creditExplanation, groupQuoteItems } from "@/lib/quotes/concepts";
import { createClient } from "@/lib/supabase/server";
import { QuoteDecision } from "../quote-client";

export const metadata: Metadata = { title: "Cotización", robots: { index: false } };

const STATUS: Record<string, { label: string; tone: string }> = {
  sent: { label: "Pendiente de tu respuesta", tone: "bg-[#FFE9CC] text-[#7A3E00]" },
  clarification: { label: "Tu pregunta está en revisión", tone: "bg-[#FFE9CC] text-[#7A3E00]" },
  approved: { label: "Aprobada", tone: "bg-[#E3F3E8] text-[#1F6B3A]" },
  rejected: { label: "Rechazada", tone: "bg-[#FDE8E4] text-[#9A2B1E]" },
  expired: { label: "Vencida", tone: "bg-[#EDEDEA] text-ink" },
};

/**
 * Visor de la cotización. Muestra el MISMO contenido del PDF emitido (misma versión y huella), en una hoja legible en el celular, con
 * la barra de decisión fija debajo: el cliente aprueba, pregunta o rechaza sin salir del documento. El PDF se abre desde el botón superior.
 */
export default async function QuoteViewerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["client"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("id, code, modality, equipment(brand, model)").eq("id", id.data).maybeSingle();
  if (!t) notFound();
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, code, version, status, valid_until, notes, terms, total, subtotal, discount_total, tax_total, urgency_amount, urgency_snapshot, delivery_fee, delivery_snapshot, diagnosis_credit, vat_included, tax_snapshot")
    .eq("ticket_id", t.id)
    .in("status", ["sent", "clarification", "approved", "rejected", "expired"])
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!quote) notFound();
  const [{ data: items }, { data: doc }, { data: events }] = await Promise.all([
    supabase.from("quote_items").select("id, kind, concept, description, qty, unit_price, line_subtotal, warranty_days").eq("quote_id", quote.id).order("position"),
    supabase.from("documents").select("id, code, version, sha256").eq("quote_id", quote.id).eq("doc_type", "quote").neq("status", "superseded").order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("quote_events").select("id, event_type, actor_role, message, created_at").eq("quote_id", quote.id).in("event_type", ["question", "answered"]).order("created_at"),
  ]);
  const eq = t.equipment as unknown as { brand: string; model: string } | null;
  const open = ["sent", "clarification"].includes(quote.status);
  const st = STATUS[quote.status] ?? { label: quote.status, tone: "bg-[#EDEDEA] text-ink" };
  const warranty = Math.max(0, ...(items ?? []).map((i) => i.warranty_days));
  const why = creditExplanation(Number(quote.diagnosis_credit));

  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
      <TextLink href={`/c/tickets/${t.id}`} className="w-fit">← Volver a mi servicio</TextLink>
      <header className="flex flex-col gap-2 rounded-card bg-ink p-5 text-white shadow-card">
        <span className="text-[12px] font-extrabold uppercase tracking-[0.05em] text-[#B9B9B4]">Cotización · versión {quote.version}</span>
        <h1 className="m-0 text-[26px] font-extrabold leading-none tracking-[-0.02em] text-brand">{quote.code}</h1>
        <p className="m-0 text-[14px] font-semibold text-[#D6D6D2]">{eq ? `${eq.brand} ${eq.model} · ` : ""}{MODALITY_LABEL[t.modality]} · Servicio {t.code}</p>
        <span className={`w-fit rounded-full px-3 py-1 text-[13px] font-extrabold ${st.tone}`}>{st.label}</span>
      </header>

      {doc ? (
        <a href={`/documentos/${doc.id}`} target="_blank" rel="noreferrer" className="press flex min-h-12 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-line-strong bg-white px-4 text-[15px] font-extrabold text-ink no-underline">
          Ver cotización en PDF
        </a>
      ) : null}

      <article aria-label={`Cotización ${quote.code}`} className="flex flex-col gap-5 rounded-card border border-line bg-white p-5 shadow-card">
        {groupQuoteItems(items ?? []).map((g) => (
          <section key={g.concept} aria-label={g.label} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between border-b border-line pb-1 text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-muted">
              <span>{g.label}</span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {g.items.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 text-[15px]">
                  <span className="min-w-0">
                    {i.description}
                    {Number(i.qty) !== 1 ? <span className="text-muted"> × {Number(i.qty)}</span> : null}
                    {i.warranty_days > 0 ? <span className="block text-[12px] text-muted">Garantía {i.warranty_days} días</span> : null}
                  </span>
                  <span className="flex-none font-extrabold">{money(i.line_subtotal)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="flex flex-col gap-1 border-t border-line pt-3 text-[14.5px] font-semibold">
          {quoteBreakdown(quote as unknown as Parameters<typeof quoteBreakdown>[0]).map((l) => (
            <div key={l.key} className={`flex justify-between gap-3 ${l.strong ? "pt-1 text-[20px] font-extrabold" : l.info ? "text-[13px] text-muted" : ""}`}>
              <span>{l.label}</span>
              <span className="flex-none">{l.sign === -1 ? "−" : ""}{money(l.amount)}</span>
            </div>
          ))}
        </div>
        {why ? <p className="m-0 rounded-[12px] bg-[#E3F3E8] p-3 text-[13.5px] font-semibold text-[#1F6B3A]">{why}</p> : null}
        <dl className="m-0 flex flex-col gap-1 text-[13px] text-muted">
          {quote.valid_until ? <div><dt className="inline font-extrabold">Vigencia: </dt><dd className="m-0 inline">hasta el {fmtDate(quote.valid_until)}</dd></div> : null}
          {warranty > 0 ? <div><dt className="inline font-extrabold">Garantía: </dt><dd className="m-0 inline">hasta {warranty} días según el concepto</dd></div> : null}
          {quote.notes ? <div><dt className="inline font-extrabold">Observaciones: </dt><dd className="m-0 inline">{quote.notes}</dd></div> : null}
          {quote.terms ? <div><dt className="inline font-extrabold">Condiciones: </dt><dd className="m-0 inline">{quote.terms}</dd></div> : null}
          {doc ? <div className="break-all"><dt className="inline font-extrabold">Huella del documento: </dt><dd className="m-0 inline">{doc.sha256.slice(0, 16)}…</dd></div> : null}
        </dl>
        <p className="m-0 text-[12.5px] text-muted">No hacemos ningún trabajo sin tu aprobación.</p>
      </article>

      {(events ?? []).length > 0 ? (
        <section aria-label="Preguntas sobre la cotización" className="flex flex-col gap-2 rounded-card border border-line bg-white p-4">
          <h2 className="m-0 text-[15px] font-extrabold">Tus preguntas</h2>
          {(events ?? []).map((e) => (
            <p key={e.id} className={`m-0 rounded-[12px] p-3 text-[14.5px] ${e.event_type === "question" ? "bg-paper" : "bg-[#FFF0DD]"}`}>
              <span className="block text-[12px] font-extrabold text-muted">{e.event_type === "question" ? "Tú" : "TechnoUltra"} · {fmtDateTime(e.created_at)}</span>
              {e.message}
            </p>
          ))}
        </section>
      ) : null}

      {open ? (
        <div className="sticky bottom-[92px] z-20 -mx-1 rounded-card border border-line bg-paper/95 p-3 shadow-card backdrop-blur lg:bottom-4">
          <QuoteDecision ticketId={t.id} quoteId={quote.id} total={money(quote.total)} />
        </div>
      ) : (
        <p className="m-0 text-center text-[14px] font-bold text-muted">
          {quote.status === "approved" ? "Aprobaste esta cotización." : quote.status === "rejected" ? "Rechazaste esta cotización." : "Esta cotización ya no está vigente."}
        </p>
      )}
    </section>
  );
}
