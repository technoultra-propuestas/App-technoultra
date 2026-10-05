import type { Metadata } from "next";
import { PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Carrito", robots: { index: false } };

export default async function CartPage() {
  await requireRole(["client"]);
  const supabase = await createClient();
  const [{ data: addresses }, { data: coverage }] = await Promise.all([
    supabase.from("addresses").select("id, label, line1, city_name, dane_code").is("deleted_at", null).order("is_default", { ascending: false }),
    supabase.from("coverage_areas").select("dane_code, home_fee").eq("is_active", true),
  ]);
  const fee = new Map((coverage ?? []).map((c) => [c.dane_code, Number(c.home_fee)]));
  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <PageTitle title="Tu carrito" subtitle="Los precios finales los confirma el servidor al crear el pedido." />
      <CartView addresses={(addresses ?? []).map((a) => ({ id: a.id, label: `${a.label} · ${a.line1}, ${a.city_name}`, covered: fee.has(a.dane_code), fee: fee.get(a.dane_code) ?? 0 }))} />
    </section>
  );
}
