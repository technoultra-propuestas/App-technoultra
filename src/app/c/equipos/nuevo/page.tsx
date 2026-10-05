import type { Metadata } from "next";
import { PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { EquipmentForm } from "../equipment-form";

export const metadata: Metadata = { title: "Agregar equipo", robots: { index: false } };

export default async function NewEquipmentPage() {
  await requireRole(["client"]);
  return (
    <section className="mx-auto flex w-full max-w-[520px] flex-col gap-6">
      <PageTitle title="Agregar equipo" />
      <EquipmentForm />
    </section>
  );
}
