import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, LinkButton, money, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProductCategoryForm } from "./forms";

export const metadata: Metadata = { title: "Productos", robots: { index: false } };

export default async function ProductsAdminPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const [{ data: products }, { data: inventory }] = await Promise.all([
    supabase.from("products").select("id, name, sku, price, is_active").is("deleted_at", null).order("name"),
    supabase.from("inventory").select("product_id, stock_on_hand, reorder_level"),
  ]);
  const inv = new Map((inventory ?? []).map((i) => [i.product_id, i]));
  return (
    <section className="flex flex-col gap-6">
      <PageTitle title="Productos e inventario" subtitle="Precios y existencias reales de la tienda. El stock cambia solo con movimientos registrados." action={<LinkButton href="/b/tienda/nuevo">Nuevo producto</LinkButton>} />
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        {(products ?? []).length === 0 ? (
          <EmptyState title="Aún no hay productos" action={<LinkButton href="/b/tienda/nuevo">Nuevo producto</LinkButton>} />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {(products ?? []).map((p) => {
              const i = inv.get(p.id);
              const low = i && i.stock_on_hand <= i.reorder_level;
              return (
                <li key={p.id}>
                  <Link href={`/b/tienda/${p.id}`} className="block no-underline">
                    <Card className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[16px] font-extrabold text-ink">{p.name}</div>
                        <div className="truncate text-[13px] font-semibold text-muted">
                          {p.sku} · {money(p.price)} · {p.is_active ? "Visible" : "Oculto"}
                        </div>
                      </div>
                      <span className={`flex-none rounded-full px-3 py-1 text-[12px] font-extrabold ${low ? "bg-[#F7E4E1] text-[#9A2B1E]" : "bg-[#E3F3E8] text-[#1F6B3A]"}`}>Stock {i?.stock_on_hand ?? 0}</span>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Card className="h-fit">
          <ProductCategoryForm />
        </Card>
      </div>
    </section>
  );
}
