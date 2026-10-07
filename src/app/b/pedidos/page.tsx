import type { Metadata } from "next";
import { Card, EmptyState, fmtDateTime, money } from "@/components/ui/layout";
import { SegmentTabs } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { manualPaymentAction, setOrderStatusAction } from "../tienda/actions";

export const metadata: Metadata = { title: "Pedidos", robots: { index: false } };

const STATUS: Record<string, string> = { new: "Nuevo", preparing: "Preparando", shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado" };
const NEXT: Record<string, [string, string][]> = {
  new: [["preparing", "Preparar"]],
  preparing: [["shipped", "Marcar enviado"]],
  shipped: [["delivered", "Marcar entregado"]],
};

export default async function OrdersAdminPage() {
  await requireRole(["superadmin"]);
  const { data } = await (await createClient())
    .from("orders")
    .select("id, code, status, total, paid_at, delivery_method, needs_installation, created_at, customers(full_name, phone)")
    .order("created_at", { ascending: false })
    .limit(100);
  const orders = data ?? [];
  return (
    <section className="flex flex-col gap-6">
      <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">Tienda</h1>
      <SegmentTabs label="Secciones de la tienda" items={[{ key: "pedidos", label: "Pedidos", href: "/b/pedidos" }, { key: "productos", label: "Productos", href: "/b/tienda" }, { key: "sync", label: "Sincronización", href: "/b/tienda/sincronizacion" }]} active="pedidos" />
      <p className="m-0 max-w-[760px] text-[14px] leading-normal text-muted">Un pedido solo avanza cuando está pagado. Los pagos en línea los confirma Mercado Pago a través del webhook verificado.</p>
      {orders.length === 0 ? (
        <EmptyState title="Aún no hay pedidos" />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {orders.map((o) => {
            const c = o.customers as unknown as { full_name: string; phone: string | null } | null;
            return (
              <li key={o.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-[17px] font-extrabold">
                        {o.code} · {c?.full_name}
                      </div>
                      <div className="text-[13px] font-semibold text-muted">
                        {fmtDateTime(o.created_at)} · {money(o.total)} · {o.delivery_method === "delivery" ? "Domicilio" : "Recoge en local"}
                        {o.needs_installation ? " · con instalación" : ""}
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[12px] font-extrabold ${o.paid_at ? "bg-[#E3F3E8] text-[#1F6B3A]" : "bg-[#FBF1D9] text-[#6E4B00]"}`}>
                      {o.status === "cancelled" ? "Cancelado" : o.paid_at ? `Pagado · ${STATUS[o.status]}` : "Sin pagar"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!o.paid_at && o.status === "new" ? (
                      <form action={manualPaymentAction} className="flex gap-2">
                        <input type="hidden" name="orderId" value={o.id} />
                        <select name="method" className="h-11 rounded-[12px] border-[1.5px] border-line-strong bg-white px-3 text-[14px]">
                          <option value="cash">Efectivo</option>
                          <option value="bank_transfer">Transferencia</option>
                          <option value="cash_on_delivery">Contraentrega</option>
                          <option value="other">Otro</option>
                        </select>
                        <button type="submit" className="min-h-11 rounded-[12px] bg-ink px-4 text-[14px] font-extrabold text-white">
                          Confirmar pago manual
                        </button>
                      </form>
                    ) : null}
                    {o.paid_at && (NEXT[o.status] ?? []).map(([to, label]) => (
                      <form key={to} action={setOrderStatusAction}>
                        <input type="hidden" name="orderId" value={o.id} />
                        <input type="hidden" name="status" value={to} />
                        <button type="submit" className="min-h-11 rounded-[12px] bg-brand px-4 text-[14px] font-extrabold text-ink">
                          {label}
                        </button>
                      </form>
                    ))}
                    {!o.paid_at && o.status === "new" ? (
                      <form action={setOrderStatusAction}>
                        <input type="hidden" name="orderId" value={o.id} />
                        <input type="hidden" name="status" value="cancelled" />
                        <button type="submit" className="min-h-11 rounded-[12px] border border-line-strong bg-white px-4 text-[14px] font-extrabold text-[#9A2B1E]">
                          Cancelar
                        </button>
                      </form>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
