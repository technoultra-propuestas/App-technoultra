import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, EQUIPMENT_LABEL, PageTitle } from "@/components/ui/layout";
import { Alert } from "@/components/ui/form";
import { requireRole } from "@/lib/auth/session";
import { priceText } from "@/lib/domain/catalog";
import { DIAGNOSIS_CONDITION } from "@/lib/domain/pricing";
import { nextBusinessDays } from "@/lib/domain/requests";
import { createClient } from "@/lib/supabase/server";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "Solicitar servicio", robots: { index: false } };

export default async function RequestServicePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireRole(["client"]);
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) notFound();
  const supabase = await createClient();
  const { data: svc } = await supabase
    .from("services")
    .select(
      "id, name, description, short_description, price_mode, base_price, price_unit, price_type_label, parts_extra, includes_text, excludes_text, price_treatment, estimated_time, requires_diagnosis, is_diagnostic_fee, allowed_modalities, requires_equipment",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!svc) notFound();

  const [{ data: eq }, { data: addr }] = await Promise.all([
    supabase
      .from("equipment")
      .select("id, type, brand, model")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("addresses")
      .select("id, label, line1, city_name, dane_code")
      .is("deleted_at", null)
      .order("is_default", { ascending: false }),
  ]);
  const addresses = await Promise.all(
    (addr ?? []).map(async (a) => {
      // Cobertura por cada modalidad física del servicio (ayuda visual; el servidor la valida de nuevo al crear la solicitud).
      const covered: Record<string, boolean> = {};
      for (const m of (svc.allowed_modalities as string[]).filter((x) => x !== "remote")) {
        const { data } = await supabase.rpc("check_coverage", { p_dane_code: a.dane_code, p_modality: m as "store" | "pickup" | "home" });
        covered[m] = data === true;
      }
      return { id: a.id, label: `${a.label} · ${a.line1}, ${a.city_name}`, covered };
    }),
  );
  const days = nextBusinessDays(5).map((d) => ({
    value: d,
    label: new Date(`${d}T12:00:00-05:00`).toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "short",
      timeZone: "America/Bogota",
    }),
  }));

  return (
    <section className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
      <PageTitle title={svc.name} subtitle={svc.description ?? svc.short_description ?? undefined} />
      <Card className="flex items-center justify-between">
        <span className="text-[14px] font-bold text-muted">Precio de referencia</span>
        <span className="text-[18px] font-extrabold">{priceText(svc)}</span>
      </Card>
      {svc.is_diagnostic_fee ? <Alert>{DIAGNOSIS_CONDITION}</Alert> : null}
      {svc.includes_text || svc.excludes_text || svc.estimated_time || svc.requires_diagnosis || svc.price_treatment ? (
        <Card className="flex flex-col gap-2 text-[14px] leading-snug">
          {svc.includes_text ? <p className="m-0"><strong>Incluye:</strong> {svc.includes_text}</p> : null}
          {svc.excludes_text ? <p className="m-0"><strong>No incluye:</strong> {svc.excludes_text}</p> : null}
          {svc.price_treatment ? <p className="m-0 text-muted">{svc.price_treatment}</p> : null}
          {svc.estimated_time ? <p className="m-0"><strong>Tiempo estimado:</strong> {svc.estimated_time}</p> : null}
          {svc.requires_diagnosis ? <p className="m-0 font-bold">Requiere diagnóstico previo; la cotización final te llega para aprobar.</p> : null}
        </Card>
      ) : null}
      <RequestForm
        serviceId={svc.id}
        modalities={svc.allowed_modalities}
        requiresEquipment={svc.requires_equipment}
        equipment={(eq ?? []).map((e) => ({
          id: e.id,
          label: `${EQUIPMENT_LABEL[e.type] ?? e.type} · ${e.brand} ${e.model}`,
        }))}
        addresses={addresses}
        days={days}
      />
    </section>
  );
}
