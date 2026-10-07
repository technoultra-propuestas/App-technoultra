import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SubmitButton } from "@/components/ui/form";
import { Card, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { acceptPendingLegalAction } from "./actions";

export const metadata: Metadata = { title: "Actualización de documentos", robots: { index: false } };

/** Se muestra cuando se publica una versión nueva que exige aceptación; hasta aceptarla no se usa el resto de la app. */
export default async function PendingLegalPage() {
  await requireRole(["client"]);
  const { data } = await (await createClient()).rpc("pending_legal_documents");
  const docs = (data ?? []) as { id: string; slug: string; title: string; version: number }[];
  if (docs.length === 0) redirect("/c");
  return (
    <section className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
      <PageTitle title="Actualizamos nuestros documentos" subtitle="Revisa los documentos con el botón «Leer». Para seguir usando TechnoUltra debes aceptar las versiones vigentes." />
      <Card className="flex flex-col gap-3">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-[14px] border border-line px-4 py-3 text-[15px] font-semibold">
              <span>
                {d.title} <span className="text-muted">· v{d.version}</span>
              </span>
              <Link href={`/legal/${d.slug}`} target="_blank" className="font-extrabold underline decoration-brand underline-offset-[3px]">
                Leer
              </Link>
            </li>
          ))}
        </ul>
        <form action={acceptPendingLegalAction} className="flex flex-col gap-3">
          <label className="flex items-start gap-3 text-[15px] font-semibold leading-snug">
            <input type="checkbox" name="accept" required className="mt-0.5 h-6 w-6 flex-none accent-[#FF8A00]" />
            He leído y acepto los documentos y políticas vigentes que aparecen en esta lista.
          </label>
          <SubmitButton>Aceptar y continuar</SubmitButton>
          <p className="m-0 text-[13px] leading-snug text-muted">Al aceptar, confirmas que has leído y aceptas nuestras políticas y condiciones vigentes. Guardamos la versión, la fecha y tu usuario como constancia, y conservamos tus aceptaciones anteriores.</p>
        </form>
      </Card>
    </section>
  );
}
