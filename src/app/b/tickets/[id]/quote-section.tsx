import { Card, fmtDate, fmtDateTime, money } from "@/components/ui/layout";
import { createClient } from "@/lib/supabase/server";
import { quoteBreakdown } from "@/lib/domain/pricing";
import { removeItemAction, setDeliveryAction, setNeedsPartAction, setUrgencyAction } from "../quote-actions";
import { AddItemForm, CreateQuoteForm, QuoteActionForm } from "./quote-forms";

const QUOTE_STATUS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada al cliente",
  clarification: "El cliente hizo una pregunta",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired: "Vencida",
  superseded: "Reemplazada",
};

export async function QuoteSection({ ticketId, canQuote, ticketOpen }: { ticketId: string; canQuote: boolean; ticketOpen: boolean }) {
  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, code, version, status, valid_until, needs_part, subtotal, discount_total, tax_total, total, urgency_level_id, urgency_amount, urgency_snapshot, delivery_fee, delivery_snapshot, diagnosis_credit, vat_included, tax_snapshot")
    .eq("ticket_id", ticketId)
    .neq("status", "superseded")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!quote) {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-[17px] font-extrabold">Cotización</h2>
        <p className="m-0 text-[14px] text-muted">Todavía no hay una cotización para este ticket.</p>
        {canQuote && ticketOpen ? <CreateQuoteForm ticketId={ticketId} /> : null}
      </Card>
    );
  }

  const [{ data: tk }, { data: levels }] = await Promise.all([
    supabase.from("tickets").select("modality").eq("id", ticketId).maybeSingle(),
    supabase.from("urgency_levels").select("id, code, label").eq("is_active", true).order("sort_order"),
  ]);
  const homeLike = tk?.modality === "home" || tk?.modality === "pickup";
  const [{ data: items }, { data: events }] = await Promise.all([
    supabase.from("quote_items").select("id, position, description, qty, unit_price, discount, line_subtotal, warranty_days").eq("quote_id", quote.id).order("position"),
    supabase.from("quote_events").select("id, event_type, actor_role, message, created_at").eq("quote_id", quote.id).order("created_at"),
  ]);
  const draft = quote.status === "draft";
  const lastQuestion = [...(events ?? [])].reverse().find((e) => e.event_type === "question");
  const [{ data: services }, { data: products }] = draft && canQuote
    ? await Promise.all([
        supabase.from("services").select("id, name").eq("is_active", true).neq("price_mode", "quote").order("name"),
        supabase.from("products").select("id, name").eq("is_active", true).order("name"),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[17px] font-extrabold">
          Cotización {quote.code} · v{quote.version}
        </h2>
        <span className="rounded-full bg-[#FFE9CC] px-3 py-1 text-[13px] font-extrabold text-[#7A3E00]">{QUOTE_STATUS[quote.status] ?? quote.status}</span>
      </div>
      {quote.valid_until ? <p className="m-0 text-[13px] text-muted">Vigente hasta {fmtDate(quote.valid_until)}</p> : null}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(items ?? []).map((i) => (
          <li key={i.id} className="flex items-start justify-between gap-3 text-[15px]">
            <div className="min-w-0">
              <div className="font-semibold">
                {i.description} <span className="text-muted">× {Number(i.qty)}</span>
              </div>
              <div className="text-[12px] text-muted">
                {money(i.unit_price)} c/u{Number(i.discount) > 0 ? ` · desc. ${money(i.discount)}` : ""}
                {i.warranty_days > 0 ? ` · garantía ${i.warranty_days} días` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold">{money(i.line_subtotal)}</span>
              {draft && canQuote ? (
                <form action={removeItemAction}>
                  <input type="hidden" name="ticketId" value={ticketId} />
                  <input type="hidden" name="itemId" value={i.id} />
                  <button type="submit" aria-label={`Quitar ${i.description}`} className="min-h-9 rounded-[10px] border border-line-strong bg-white px-2 text-[13px] font-bold text-[#9A2B1E]">
                    Quitar
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1 border-t border-line pt-3 text-[14px] font-semibold">
        {quoteBreakdown(quote as unknown as Parameters<typeof quoteBreakdown>[0]).map((l) => (
          <div key={l.key} className={`flex justify-between ${l.strong ? "text-[18px] font-extrabold" : l.info ? "text-[13px] text-muted" : l.key === "subtotal" ? "" : "text-muted"}`}>
            <span>{l.label}</span>
            <span>
              {l.sign === -1 ? "−" : ""}
              {money(l.amount)}
            </span>
          </div>
        ))}
      </div>

      {draft && canQuote ? (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-[14px] border border-line p-3">
            <form action={setUrgencyAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="ticketId" value={ticketId} />
              <input type="hidden" name="quoteId" value={quote.id} />
              <label className="flex flex-col gap-1 text-[13px] font-bold">
                Urgencia
                <select name="levelId" defaultValue={quote.urgency_level_id ?? ""} className="h-11 rounded-[12px] border border-line-strong bg-white px-3 text-[15px]">
                  <option value="">Normal (sin recargo)</option>
                  {(levels ?? []).filter((l) => l.code !== "normal").map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="min-h-11 rounded-[12px] border border-line-strong bg-white px-3 text-[13px] font-bold">
                Aplicar
              </button>
            </form>
            {homeLike ? (
              <form action={setDeliveryAction}>
                <input type="hidden" name="ticketId" value={ticketId} />
                <input type="hidden" name="quoteId" value={quote.id} />
                <input type="hidden" name="apply" value={String(Number(quote.delivery_fee) === 0)} />
                <button type="submit" className="min-h-11 rounded-[12px] border border-line-strong bg-white px-3 text-[13px] font-bold">
                  {Number(quote.delivery_fee) === 0 ? "Agregar domicilio" : "Quitar domicilio"}
                </button>
              </form>
            ) : null}
          </div>
          <form action={setNeedsPartAction} className="flex items-center gap-3 text-[14px] font-semibold">
            <input type="hidden" name="ticketId" value={ticketId} />
            <input type="hidden" name="quoteId" value={quote.id} />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="needsPart" defaultChecked={quote.needs_part} className="h-5 w-5 accent-[#FF8A00]" />
              Requiere pedir un repuesto
            </label>
            <button type="submit" className="min-h-9 rounded-[10px] border border-line-strong bg-white px-3 text-[13px] font-bold">
              Guardar
            </button>
          </form>
          <details className="rounded-[14px] border border-line p-3">
            <summary className="cursor-pointer text-[15px] font-extrabold">Agregar ítem</summary>
            <div className="pt-3">
              <AddItemForm ticketId={ticketId} quoteId={quote.id} services={services ?? []} products={products ?? []} />
            </div>
          </details>
          <QuoteActionForm ticketId={ticketId} quoteId={quote.id} kind="send" label="Enviar al cliente" />
        </>
      ) : null}

      {quote.status === "clarification" && canQuote ? (
        <div className="flex flex-col gap-2 rounded-[14px] bg-[#FFF0DD] p-3">
          <div className="text-[14px] font-extrabold">Pregunta del cliente</div>
          <p className="m-0 text-[15px]">{lastQuestion?.message}</p>
          <QuoteActionForm ticketId={ticketId} quoteId={quote.id} kind="answer" label="Responder" withMessage />
        </div>
      ) : null}

      {["sent", "clarification"].includes(quote.status) && canQuote ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <QuoteActionForm ticketId={ticketId} quoteId={quote.id} kind="inperson" label="Registrar aprobación presencial" variant="dark" />
          <QuoteActionForm ticketId={ticketId} quoteId={quote.id} kind="revise" label="Crear nueva versión" />
        </div>
      ) : null}

      {(events ?? []).length > 0 ? (
        <details>
          <summary className="cursor-pointer text-[14px] font-bold text-muted">Historial de la cotización</summary>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-[13px]">
            {(events ?? []).map((e) => (
              <li key={e.id}>
                <span className="font-bold">{e.event_type}</span> · {e.actor_role} · {fmtDateTime(e.created_at)}
                {e.message ? ` — ${e.message}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
