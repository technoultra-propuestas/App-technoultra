import Link from "next/link";
import { Card, money } from "@/components/ui/layout";
import { COMPATIBILITY_NOTE } from "@/lib/ai/product-hints";
import { loadProposal } from "@/lib/quotes/load";
import { createClient } from "@/lib/supabase/server";
import { ProposalForm } from "./proposal-form";

/**
 * «Propuesta automática»: servicios del catálogo que corresponden al diagnóstico, ya marcados. El técnico solo valida
 * (quita, modifica, agrega) y pulsa «Usar propuesta». Se muestra con el diagnóstico guardado y mientras la cotización siga en borrador o no exista.
 */
export async function ProposalPanel({ ticketId, status }: { ticketId: string; status: string }) {
  if (status !== "diagnosing") return null;
  const supabase = await createClient();
  const [{ data: quote }, { data: diag }] = await Promise.all([
    supabase.from("quotes").select("id, status").eq("ticket_id", ticketId).neq("status", "superseded").order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("diagnostics").select("id").eq("ticket_id", ticketId).limit(1).maybeSingle(),
  ]);
  if (!diag || (quote && quote.status !== "draft")) return null;
  const loaded = await loadProposal(supabase, ticketId);
  if (!loaded) return null;
  const { proposal, products } = loaded;
  if (proposal.lines.length === 0 && proposal.unmatched.length === 0) {
    return (
      <Card className="flex flex-col gap-1">
        <h2 className="m-0 text-[17px] font-extrabold">Propuesta automática</h2>
        <p className="m-0 text-[14px] text-muted">Con lo registrado no hay servicios del catálogo que proponer. Agrega los conceptos a mano en la cotización.</p>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="m-0 text-[17px] font-extrabold">Propuesta automática</h2>
        <p className="m-0 mt-0.5 text-[13px] text-muted">
          Detectamos: {proposal.needs.join(", ").toLowerCase()}. Son sugerencias con precios del catálogo; tú decides qué se cotiza.
        </p>
      </div>
      <ProposalForm
        ticketId={ticketId}
        lines={proposal.lines.map((l) => ({ key: l.key, name: l.name, priority: l.priority, price: l.unitPrice, priceText: l.unitPrice === null ? null : money(l.unitPrice), review: l.review, reviewWhy: l.reviewWhy ?? null, reason: l.reason }))}
      />
      {proposal.unmatched.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-muted">
          {proposal.unmatched.map((u) => (
            <li key={u.ruleId + u.what}>⚠ {u.what}: {u.why}</li>
          ))}
        </ul>
      ) : null}
      {products.length ? (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <h3 className="m-0 text-[14px] font-extrabold">Productos del Shop que podrían servir</h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13.5px]">
            {products.map((p) => (
              <li key={p.id}>
                <Link href={`/tienda/producto/${p.slug}`} className="font-bold text-ink underline decoration-brand underline-offset-[3px]">{p.name}</Link> · {money(p.price)}
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12.5px] text-muted">{COMPATIBILITY_NOTE} Los productos del Shop se venden por WhatsApp; no entran a la cotización.</p>
        </div>
      ) : null}
    </Card>
  );
}
