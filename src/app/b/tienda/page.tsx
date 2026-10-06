import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, money } from "@/components/ui/layout";
import { PrimaryLink, SegmentTabs } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProductCategoryForm } from "./forms";

export const metadata: Metadata = { title: "Tienda · Productos", robots: { index: false } };

const STORE_TABS = [
  { key: "pedidos", label: "Pedidos", href: "/b/pedidos" },
  { key: "productos", label: "Productos", href: "/b/tienda" },
];

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const warranty = (d: number) => (d <= 0 ? "Sin garantía" : d % 30 === 0 ? `Garantía ${d / 30} ${d / 30 === 1 ? "mes" : "meses"}` : `Garantía ${d} días`);

export default async function ProductsAdminPage() {
  await requireRole(["superadmin"]);
  const supabase = await createClient();
  const [{ data: products }, { data: inventory }] = await Promise.all([
    supabase.from("products").select("id, name, sku, price, is_active, warranty_days, product_categories(name)").is("deleted_at", null).order("name"),
    supabase.from("inventory").select("product_id, stock_on_hand, reorder_level"),
  ]);
  const inv = new Map((inventory ?? []).map((i) => [i.product_id, i]));
  const list = products ?? [];
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">Tienda</h1>
        <PrimaryLink href="/b/tienda/nuevo" icon="plus">
          Nuevo producto
        </PrimaryLink>
      </div>
      <SegmentTabs label="Secciones de la tienda" items={STORE_TABS} active="productos" />
      {list.length === 0 ? (
        <EmptyState title="Aún no hay productos" text="Crea el primero para mostrarlo en la tienda. El stock cambia solo con movimientos registrados." />
      ) : (
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-white p-0 shadow-card">
          {list.map((p) => {
            const i = inv.get(p.id);
            const stock = i?.stock_on_hand ?? 0;
            const out = stock <= 0;
            const low = !out && i && stock <= i.reorder_level;
            const cat = one(p.product_categories as Rel<{ name: string }>);
            return (
              <li key={p.id} className="border-b border-line last:border-0">
                <Link href={`/b/tienda/${p.id}`} className="press grid min-h-[64px] items-center gap-x-4 gap-y-1 px-5 py-3 text-ink no-underline hover:bg-paper md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_110px_160px_110px]">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-extrabold">{p.name}</span>
                    <span className="truncate text-[12.5px] font-semibold text-muted">{p.sku}{p.is_active ? "" : " · Oculto en la tienda"}</span>
                  </span>
                  <span className="truncate text-[14px] font-semibold text-ink-2">{cat?.name ?? "Sin categoría"}</span>
                  <span className="text-[15px] font-extrabold md:text-right">{money(p.price)}</span>
                  <span className="text-[13.5px] font-semibold text-ink-2">{warranty(p.warranty_days)}</span>
                  <span className="justify-self-start md:justify-self-end">
                    <span className={`inline-flex rounded-full px-3 py-1 text-[12.5px] font-extrabold ${out ? "bg-danger-soft text-danger" : low ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>{out ? "Agotado" : `${stock} u.`}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <details className="rounded-card border border-line bg-white p-5 shadow-card">
        <summary className="cursor-pointer text-[17px] font-extrabold">Categorías de productos</summary>
        <div className="max-w-[420px] pt-4">
          <ProductCategoryForm />
        </div>
      </details>
    </section>
  );
}
