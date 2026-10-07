import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { safeReturnTo } from "@/lib/navigation";
import { EquipmentForm } from "../equipment-form";

export const metadata: Metadata = { title: "Agregar equipo", robots: { index: false } };

export default async function NewEquipmentPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  await requireRole(["client"]);
  // Si se llegó desde una solicitud de servicio, al guardar se vuelve a ella con el equipo seleccionado.
  const returnTo = safeReturnTo((await searchParams).returnTo);
  return (
    <section className="mx-auto flex w-full max-w-[520px] flex-col gap-6">
      {returnTo ? (
        <Link href={returnTo} className="inline-flex min-h-11 w-fit items-center text-[14px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">
          ← Volver a mi solicitud
        </Link>
      ) : null}
      <PageTitle title="Agregar equipo" subtitle={returnTo ? "Al guardarlo volverás a tu solicitud con este equipo ya seleccionado." : undefined} />
      <EquipmentForm returnTo={returnTo} />
    </section>
  );
}
