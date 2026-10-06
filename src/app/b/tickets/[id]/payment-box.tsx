import { Card, money } from "@/components/ui/layout";
import { createClient } from "@/lib/supabase/server";
import { recordQuotePaymentAction } from "../diagnosis-actions";

/** Estado de pago de la cotización aprobada y registro manual (solo SUPERADMIN). El pago en línea lo confirma el webhook verificado. */
export async function PaymentBox({ ticketId, isOwner }: { ticketId: string; isOwner: boolean }) {
  const supabase = await createClient();
  const { data: quote } = await supabase.from("quotes").select("id, code, total, paid_at").eq("ticket_id", ticketId).eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle();
  if (!quote || Number(quote.total) <= 0) return null;
  const { data: pays } = isOwner ? await supabase.from("payments").select("provider, method, status, amount, created_at").eq("quote_id", quote.id).order("created_at", { ascending: false }).limit(5) : { data: [] };
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="m-0 text-[17px] font-extrabold">Pago de la cotización {quote.code}</h2>
      <p className="m-0 text-[14px] font-semibold">
        {quote.paid_at ? `✓ Pagada el ${new Date(quote.paid_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}` : `Pendiente de pago · ${money(quote.total)}`}
      </p>
      {(pays ?? []).length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-muted">
          {(pays ?? []).map((p, i) => (
            <li key={i}>
              {p.provider === "manual" ? `Manual (${p.method})` : "Mercado Pago"} · {p.status} · {money(p.amount)}
            </li>
          ))}
        </ul>
      ) : null}
      {isOwner && !quote.paid_at ? (
        <form action={recordQuotePaymentAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="quoteId" value={quote.id} />
          <label className="flex flex-col gap-1 text-[13px] font-bold">
            Registrar pago manual
            <select name="method" className="h-11 rounded-[12px] border border-line-strong bg-white px-3 text-[15px]">
              <option value="cash">Efectivo</option>
              <option value="bank_transfer">Transferencia</option>
              <option value="other">Otro</option>
            </select>
          </label>
          <button type="submit" className="min-h-11 rounded-[12px] bg-ink px-4 text-[14px] font-extrabold text-white">
            Registrar pago · {money(quote.total)}
          </button>
        </form>
      ) : null}
    </Card>
  );
}
