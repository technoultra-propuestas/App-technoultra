import type { Metadata } from "next";
import Link from "next/link";
import { AddToCart } from "@/components/store/AddToCart";
import { Card, EmptyState, money, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tienda", robots: { index: false } };

export default async function StorePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["client"]);
  const cat = (await searchParams).cat;
  const supabase = await createClient();
  let q = supabase.from("products").select("id, name, brand, price, warranty_days, category_id").order("name");
  if (cat && /^[0-9a-f-]{36}$/i.test(cat)) q = q.eq("category_id", cat);
  const [{ data: products }, { data: cats }, { data: flags }] = await Promise.all([q, supabase.from("product_categories").select("id, name").order("sort_order"), supabase.rpc("product_stock_flags")]);
  const stock = new Map(((flags ?? []) as { product_id: string; in_stock: boolean; low_stock: boolean }[]).map((f) => [f.product_id, f]));
  return (
    <section className="flex flex-col gap-6">
      <PageTitle title="Tienda" subtitle="Productos con garantía. Puedes pedir la instalación junto con tu compra." action={<Link href="/c/carrito" className="inline-flex min-h-[52px] items-center rounded-2xl bg-ink px-5 text-[16px] font-extrabold text-white no-underline">Ver carrito</Link>} />
      {(cats ?? []).length > 0 ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Link href="/c/tienda" className={`flex-none rounded-full px-4 py-2 text-[14px] font-extrabold no-underline ${!cat ? "bg-ink text-white" : "border border-line bg-white text-ink-2"}`}>Todo</Link>
          {(cats ?? []).map((c) => (
            <Link key={c.id} href={`/c/tienda?cat=${c.id}`} className={`flex-none rounded-full px-4 py-2 text-[14px] font-extrabold no-underline ${cat === c.id ? "bg-ink text-white" : "border border-line bg-white text-ink-2"}`}>{c.name}</Link>
          ))}
        </div>
      ) : null}
      {(products ?? []).length === 0 ? (
        <EmptyState title="Aún no hay productos" text="Estamos cargando el catálogo de la tienda." />
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3 p-0">
          {(products ?? []).map((p) => {
            const s = stock.get(p.id);
            return (
              <li key={p.id}>
                <Card className="flex h-full flex-col gap-2">
                  <div className="text-[17px] font-extrabold">{p.name}</div>
                  {p.brand ? <div className="text-[13px] font-semibold text-muted">{p.brand}</div> : null}
                  <div className="text-[20px] font-extrabold">{money(p.price)}</div>
                  <div className="text-[12px] font-bold text-muted">{p.warranty_days > 0 ? `Garantía ${p.warranty_days} días` : "Sin garantía"}{s?.low_stock && s.in_stock ? " · últimas unidades" : ""}</div>
                  <div className="mt-auto pt-2">
                    <AddToCart productId={p.id} disabled={!s?.in_stock} />
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
