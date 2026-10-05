import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, fmtDate, LinkButton, money, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis pedidos", robots: { index: false } };

export const ORDER_STATUS: Record<string, string> = { new: "Nuevo", preparing: "Preparando", shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado" };

export default async function OrdersPage() {
  await requireRole(["client"]);
  const { data } = await (await createClient()).from("orders").select("id, code, status, total, paid_at, created_at").order("created_at", { ascending: false }).limit(50);
  const orders = data ?? [];
  return (
    <section className="flex flex-col gap-6">
      <PageTitle title="Mis pedidos" action={<LinkButton href="/c/tienda">Ir a la tienda</LinkButton>} />
      {orders.length === 0 ? (
        <EmptyState title="Todavía no tienes pedidos" />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/c/pedidos/${o.id}`} className="block no-underline">
                <Card className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[16px] font-extrabold text-ink">{o.code}</div>
                    <div className="text-[13px] font-semibold text-muted">
                      {fmtDate(o.created_at)} · {money(o.total)}
                    </div>
                  </div>
                  <span className="rounded-full bg-[#EDEDEA] px-3 py-1 text-[12px] font-extrabold">{o.paid_at ? ORDER_STATUS[o.status] : o.status === "cancelled" ? "Cancelado" : "Pendiente de pago"}</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
