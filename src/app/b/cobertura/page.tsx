import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/ui/detail";
import { StatCard } from "@/components/ui/kit";
import { Card, money, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toggleAreaAction } from "./actions";
import { AreaForm } from "./area-form";
import { FeesForm } from "./fees-form";

export const metadata: Metadata = { title: "Cobertura", robots: { index: false } };

export default async function CoveragePage() {
  await requireRole(["superadmin"]);
  const supabase = await createClient();
  const [{ data }, { data: shop }] = await Promise.all([
    supabase.from("coverage_areas").select("id, department, city_name, dane_code, is_active, pickup_fee, home_fee").order("city_name"),
    supabase.from("shop_settings").select("shipping_urban_fee, shipping_outside_fee").maybeSingle(),
  ]);
  const active = (data ?? []).filter((a) => a.is_active).length;
  return (
    <section className="flex flex-col gap-6">
      <PageTitle
        title="Cobertura presencial"
        subtitle="Los servicios en tienda, con recogida o a domicilio solo se pueden agendar en estos municipios. El soporte remoto es nacional y no depende de esta lista."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard value={active} label="Municipios activos" icon="map" tone="dark" />
        <StatCard value={(data ?? []).length - active} label="Municipios inactivos" icon="lock" />
        <StatCard value={money(Number(shop?.shipping_urban_fee ?? 10000))} label="Producto · Cali urbano" icon="box" />
        <StatCard value={money(Number(shop?.shipping_outside_fee ?? 20000))} label="Producto · fuera del perímetro" icon="box" />
      </div>
      <Panel title="Domicilio de productos (Shop)" hint="Independiente de las tarifas de servicios de esta lista. Es informativo: se confirma por WhatsApp según la dirección.">
        <p className="m-0 text-[14px] leading-normal text-ink-2">
          La referencia para «Cali urbano» es el perímetro urbano oficial del POT de Santiago de Cali (datos.cali.gov.co, DAPM). La tarifa nunca se deduce del texto «Cali» que escriba el cliente. Las tarifas se editan en <Link href="/b/tienda/shop" className="font-extrabold text-ink underline decoration-brand underline-offset-[3px]">Tienda › Shop</Link>.
        </p>
      </Panel>
      <div className="grid gap-6 md:grid-cols-[1fr_380px]">
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {(data ?? []).map((a) => (
            <li key={a.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[17px] font-extrabold">{a.city_name}</div>
                    <div className="text-[13px] font-semibold text-muted">
                      {a.department} · DANE {a.dane_code} · Recogida {money(a.pickup_fee)} · Domicilio {money(a.home_fee)}
                    </div>
                  </div>
                  <form action={toggleAreaAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="active" value={a.is_active ? "false" : "true"} />
                    <button type="submit" className={`min-h-11 rounded-[14px] px-4 text-[14px] font-extrabold ${a.is_active ? "bg-[#E3F3E8] text-[#1F6B3A]" : "bg-[#EDEDEA] text-ink-2"}`}>
                      {a.is_active ? "Activa" : "Inactiva"}
                    </button>
                  </form>
                </div>
                <FeesForm id={a.id} pickupFee={Number(a.pickup_fee)} homeFee={Number(a.home_fee)} />
              </Card>
            </li>
          ))}
        </ul>
        <Card className="h-fit">
          <h2 className="m-0 mb-4 text-[19px] font-extrabold">Agregar municipio</h2>
          <AreaForm />
        </Card>
      </div>
    </section>
  );
}
