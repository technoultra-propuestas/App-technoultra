import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, EQUIPMENT_LABEL, PageTitle } from "@/components/ui/layout";
import { Alert } from "@/components/ui/form";
import { requireRole } from "@/lib/auth/session";
import { priceText } from "@/lib/domain/catalog";
import { DIAGNOSIS_CONDITION } from "@/lib/domain/pricing";
import { nextBusinessDays } from "@/lib/domain/requests";
import type { Zone } from "@/lib/domain/delivery";
import { loadZones } from "@/lib/tickets/zone";
import { createClient } from "@/lib/supabase/server";
import { RequestForm } from "./request-form";
import { BackLink } from "@/components/ui/kit";

export const metadata: Metadata = { title: "Solicitar servicio", robots: { index: false } };

export default async function RequestServicePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ equipo?: string; direccion?: string }> }) {
  await requireRole(["client"]);
  const { slug } = await params;
  const sp = await searchParams;
  const equipo = sp.equipo;
  const direccion = sp.direccion;
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

  const [{ data: eq }, { data: addr }, { data: cities }] = await Promise.all([
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
    supabase.from("coverage_areas").select("dane_code, city_name").eq("is_active", true).order("city_name"),
  ]);
  // Cobertura y tarifa de cada dirección (ayuda para mostrar el valor ANTES de enviar; el servidor lo valida y lo calcula de nuevo al crear la solicitud y la cotización).
  const zones = await loadZones(supabase, (addr ?? []).map((a) => a.dane_code), svc.allowed_modalities as string[]);
  const addresses = (addr ?? []).map((a) => ({ id: a.id, label: `${a.label} · ${a.line1}, ${a.city_name}`, zone: { ...(zones.get(a.dane_code) as Zone), city: a.city_name } }));
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
    <section className="mx-auto flex w-full max-w-[560px] flex-col gap-6 lg:max-w-[1120px]">
      <BackLink href="/c/solicitar">Volver a servicios</BackLink>
      <PageTitle title={svc.name} subtitle={svc.description ?? svc.short_description ?? undefined} />
      {/* Escritorio: el resumen del servicio queda a la izquierda y el formulario aprovecha el resto; en móvil sigue una sola columna igual que antes. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
      <aside data-request-summary className="flex flex-col gap-6 lg:sticky lg:top-6">
      <Card className="flex items-center justify-between">
        <span className="text-[14px] font-bold text-muted">Precio de referencia</span>
        <span className="text-[18px] font-extrabold">{priceText(svc)}</span>
      </Card>
      {svc.is_diagnostic_fee ? <Alert>{DIAGNOSIS_CONDITION}</Alert> : null}
      {svc.includes_text || svc.excludes_text || svc.estimated_time || svc.requires_diagnosis ? (
        <Card className="flex flex-col gap-2 text-[14px] leading-snug">
          {svc.includes_text ? <p className="m-0"><strong>Incluye:</strong> {svc.includes_text}</p> : null}
          {svc.excludes_text ? <p className="m-0"><strong>No incluye:</strong> {svc.excludes_text}</p> : null}
          {svc.estimated_time ? <p className="m-0"><strong>Tiempo estimado:</strong> {svc.estimated_time}</p> : null}
          {svc.requires_diagnosis ? <p className="m-0 font-bold">Requiere diagnóstico previo; la cotización final te llega para aprobar.</p> : null}
        </Card>
      ) : null}
      </aside>
      <div className="min-w-0 lg:rounded-card lg:border lg:border-line lg:bg-white lg:p-6 lg:shadow-card">
      <RequestForm
        serviceId={svc.id}
        modalities={svc.allowed_modalities}
        requiresEquipment={svc.requires_equipment}
        equipment={(eq ?? []).map((e) => ({
          id: e.id,
          label: `${EQUIPMENT_LABEL[e.type] ?? e.type} · ${e.brand} ${e.model}`,
        }))}
        addresses={addresses}
        cities={cities ?? []}
        days={days}
        initialEquipmentId={equipo && /^[0-9a-f-]{36}$/i.test(equipo) ? equipo : undefined}
        initialAddressId={direccion && /^[0-9a-f-]{36}$/i.test(direccion) ? direccion : undefined}
      />
      </div>
      </div>
    </section>
  );
}
