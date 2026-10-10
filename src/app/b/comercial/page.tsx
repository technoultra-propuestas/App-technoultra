import type { Metadata } from "next";
import Link from "next/link";
import { ListRow } from "@/components/ui/kit";
import { Card, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TaxForm } from "./tax-form";
import { UrgencyForm } from "./urgency-form";

export const metadata: Metadata = { title: "Configuración comercial", robots: { index: false } };

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/** Impuestos y recargos. Todo vive en Supabase; el domicilio se configura por municipio en Cobertura. Solo administración. */
export default async function CommercialPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRole(["superadmin"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: settings }, { data: levels }, { data: links }, { data: services }, { data: areas }] = await Promise.all([
    supabase.from("app_settings").select("key, value").in("key", ["tax.vat_responsible", "tax.vat_rate"]),
    supabase.from("urgency_levels").select("*").order("sort_order"),
    supabase.from("urgency_level_services").select("level_id, service_id"),
    supabase.from("services").select("id, name").is("deleted_at", null).eq("is_active", true).order("name"),
    supabase.from("coverage_areas").select("city_name, home_fee, pickup_fee").eq("is_active", true).order("city_name"),
  ]);
  const set = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));
  const responsible = set["tax.vat_responsible"] === true;
  const rate = Number(set["tax.vat_rate"] ?? 19);
  const money = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
  const money2 = (n: number) => "$" + n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const vat = Math.round(((100000 * rate) / (100 + rate)) * 100) / 100;
  return (
    <section className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
      <PageTitle title="Configuración comercial" subtitle="Impuestos, recargo por urgencia y domicilio. Los cambios se auditan y nunca alteran cotizaciones, pagos ni órdenes ya emitidas." />
      {sp.ok ? <p role="status" className="m-0 rounded-xl bg-[#E3F3E8] px-4 py-3 text-[14px] font-bold text-[#1F6B3A]">Cambios guardados.</p> : null}
      {sp.error ? <p role="alert" className="m-0 rounded-xl bg-[#FBE4E1] px-4 py-3 text-[14px] font-bold text-[#9A2B1E]">No pudimos guardar: revisa los valores.</p> : null}

      <div className="rounded-card border border-line bg-white p-2 shadow-card">
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          <li><ListRow href="/b/tienda/shop" title="Shop y promociones" detail="Banner promocional, textos, envío de productos, mensaje de WhatsApp y destacados" icon="store" tone="neutral" /></li>
          <li><ListRow href="/b/servicios" title="Servicios y precios" detail="Catálogo, precios de referencia y reglas de cobro" icon="wrench" tone="neutral" /></li>
          <li><ListRow href="/b/cobertura" title="Cobertura y domicilio" detail="Municipios y tarifas de servicios presenciales" icon="map" tone="neutral" /></li>
        </ul>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-[19px] font-extrabold">IVA</h2>
        <p className="m-0 text-[14px] text-ink-2">
          Los precios del catálogo y la tienda son siempre el precio FINAL al cliente. Hoy no se agrega ni se muestra IVA. Si activas «Responsable de IVA», el IVA se desglosa del total (informativo) y los precios NO cambian.
        </p>
        <TaxForm responsible={responsible} rate={rate} />
        <p className="m-0 text-[12px] text-muted">Ejemplo con IVA {rate}%: precio final $100.000 → base {money2(100000 - vat)} + IVA {money2(vat)}.</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-[19px] font-extrabold">Domicilio</h2>
        <p className="m-0 text-[14px] text-ink-2">Concepto independiente del servicio, configurado por municipio.</p>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px] font-semibold">
          {(areas ?? []).map((a) => (
            <li key={a.city_name}>
              {a.city_name}: domicilio {money(Number(a.home_fee))} · recogida {money(Number(a.pickup_fee))}
            </li>
          ))}
        </ul>
        <Link href="/b/cobertura" className="text-[14px] font-bold">
          Editar tarifas en Cobertura
        </Link>
      </Card>

      <h2 className="m-0 text-[19px] font-extrabold">Recargo por urgencia</h2>
      {(levels ?? []).map((l) => {
        const mine = new Set((links ?? []).filter((x) => x.level_id === l.id).map((x) => x.service_id));
        return (
          <Card key={l.id}>
            <UrgencyForm
              level={{ id: l.id, label: l.label, percent: Number(l.percent), fixed_amount: Number(l.fixed_amount), min_amount: Number(l.min_amount), start: hhmm(l.start_time), end: hhmm(l.end_time), days: l.days, modalities: l.modalities, is_active: l.is_active }}
              services={services ?? []}
              selected={[...mine]}
            />
          </Card>
        );
      })}
    </section>
  );
}
