import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ClearCartOnMount } from "@/components/store/ClearCartOnMount";
import { Alert } from "@/components/ui/form";
import { Card, fmtDateTime, money, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cancelOrderAction, startPaymentAction } from "../actions";

export const metadata: Metadata = { title: "Pedido", robots: { index: false } };

const NOTICE: Record<string, string> = {
  exito: "Estamos confirmando tu pago con Mercado Pago. Se actualizará aquí en unos instantes.",
  pendiente: "Tu pago está pendiente de confirmación.",
  fallo: "El pago no se completó. Puedes intentarlo de nuevo.",
  no_configurado: "Los pagos en línea todavía no están habilitados. Escríbenos para coordinar el pago.",
  no_disponible: "Este pedido ya no se puede pagar.",
  error: "No pudimos iniciar el pago. Inténtalo de nuevo.",
  limite: "Demasiados intentos. Espera unos minutos.",
};
const PAYMENT: Record<string, string> = { pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado", cancelled: "Cancelado", refunded: "Reembolsado", expired: "Vencido" };

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["client"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: o } = await supabase.from("orders").select("id, code, status, subtotal, shipping_fee, total, paid_at, expires_at, delivery_method, needs_installation, created_at").eq("id", id.data).maybeSingle();
  if (!o) notFound();
  const [{ data: items }, { data: payments }] = await Promise.all([
    supabase.from("order_items").select("id, description, qty, unit_price, line_total").eq("order_id", o.id),
    supabase.from("payments").select("id, code, status, provider, method, created_at").eq("order_id", o.id).order("created_at", { ascending: false }),
  ]);
  const payable = o.status === "new" && !o.paid_at && (!o.expires_at || new Date(o.expires_at) > new Date());
  // La confirmación de pago SIEMPRE sale de la base de datos (webhook verificado); ?pago= solo muestra un aviso informativo.
  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <ClearCartOnMount />
      <PageTitle title={o.code} subtitle={`${o.delivery_method === "delivery" ? "Entrega a domicilio" : "Recoger en el local"} · ${fmtDateTime(o.created_at)}`} />
      {sp.pago && NOTICE[sp.pago] ? <Alert tone={sp.pago === "exito" ? "ok" : "error"}>{NOTICE[sp.pago]}</Alert> : null}
      <Card className="flex flex-col gap-3">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {(items ?? []).map((i) => (
            <li key={i.id} className="flex justify-between gap-3 text-[15px]">
              <span>
                {i.description} <span className="text-muted">× {i.qty}</span>
              </span>
              <span className="font-extrabold">{money(i.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1 border-t border-line pt-3 text-[15px] font-semibold">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(o.subtotal)}</span></div>
          {Number(o.shipping_fee) > 0 ? <div className="flex justify-between"><span>Envío</span><span>{money(o.shipping_fee)}</span></div> : null}
          <div className="flex justify-between text-[19px] font-extrabold"><span>Total</span><span>{money(o.total)}</span></div>
        </div>
        {o.needs_installation ? <p className="m-0 text-[13px] text-muted">Incluye instalación: nuestro equipo te contactará para agendarla.</p> : null}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-[17px] font-extrabold">Pago</h2>
        {o.paid_at ? <Alert tone="ok">Pago confirmado el {fmtDateTime(o.paid_at)}.</Alert> : null}
        {(payments ?? []).map((p) => (
          <div key={p.id} className="flex justify-between text-[14px] font-semibold">
            <span>{p.code} · {p.provider === "mercadopago" ? "Mercado Pago" : "Manual"}</span>
            <span>{PAYMENT[p.status] ?? p.status}</span>
          </div>
        ))}
        {payable ? (
          <>
            <form action={startPaymentAction}>
              <input type="hidden" name="orderId" value={o.id} />
              <button type="submit" className="min-h-[58px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-ink">Pagar con Mercado Pago</button>
            </form>
            {o.expires_at ? <p className="m-0 text-[12px] text-muted">Reservamos tu pedido hasta el {fmtDateTime(o.expires_at)}.</p> : null}
            <form action={cancelOrderAction}>
              <input type="hidden" name="orderId" value={o.id} />
              <button type="submit" className="min-h-11 rounded-[12px] border border-line-strong bg-white px-4 text-[14px] font-extrabold text-[#9A2B1E]">Cancelar pedido</button>
            </form>
          </>
        ) : null}
      </Card>
    </section>
  );
}
