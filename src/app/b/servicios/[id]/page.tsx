import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Editar servicio", robots: { index: false } };

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const [{ data: svc }, { data: cats }] = await Promise.all([
    supabase.from("services").select("*").eq("id", id.data).is("deleted_at", null).maybeSingle(),
    supabase.from("service_categories").select("id, name, kind").order("sort_order"),
  ]);
  if (!svc) notFound();
  return (
    <section className="mx-auto flex w-full max-w-[600px] flex-col gap-6">
      <PageTitle title={svc.name} />
      <ServiceForm values={svc} categories={cats ?? []} />
    </section>
  );
}
