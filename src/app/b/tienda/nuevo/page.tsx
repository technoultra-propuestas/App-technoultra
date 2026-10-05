import type { Metadata } from "next";
import { PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "../forms";

export const metadata: Metadata = { title: "Nuevo producto", robots: { index: false } };

export default async function NewProductPage() {
  await requireRole(["superadmin"]);
  const { data } = await (await createClient()).from("product_categories").select("id, name").order("sort_order");
  return (
    <section className="mx-auto flex w-full max-w-[600px] flex-col gap-6">
      <PageTitle title="Nuevo producto" />
      <ProductForm categories={data ?? []} />
    </section>
  );
}
