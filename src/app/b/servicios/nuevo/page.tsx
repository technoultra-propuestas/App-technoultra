import type { Metadata } from "next";
import { PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Nuevo servicio", robots: { index: false } };

export default async function NewServicePage() {
  await requireRole(["admin"]);
  const { data } = await (await createClient()).from("service_categories").select("id, name, kind").order("sort_order");
  return (
    <section className="mx-auto flex w-full max-w-[600px] flex-col gap-6">
      <PageTitle title="Nuevo servicio" />
      <ServiceForm categories={data ?? []} />
    </section>
  );
}
