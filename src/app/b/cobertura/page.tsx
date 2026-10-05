import type { Metadata } from "next";
import { Card, money, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toggleAreaAction, updateFeesAction } from "./actions";
import { AreaForm } from "./area-form";

export const metadata: Metadata = { title: "Cobertura", robots: { index: false } };

export default async function CoveragePage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase.from("coverage_areas").select("id, department, city_name, dane_code, is_active, pickup_fee, home_fee").order("city_name");
  return (
    <section className="flex flex-col gap-6">
      <PageTitle
        title="Cobertura presencial"
        subtitle="Los servicios en tienda, con recogida o a domicilio solo se pueden agendar en estos municipios. El soporte remoto es nacional y no depende de esta lista."
      />
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
                <form action={updateFeesAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={a.id} />
                  <label className="flex flex-col gap-1 text-[12px] font-bold">
                    Recogida
                    <input name="pickupFee" defaultValue={Number(a.pickup_fee)} inputMode="numeric" className="h-11 w-28 rounded-[12px] border-[1.5px] border-line-strong bg-white px-3 text-[15px] font-semibold" />
                  </label>
                  <label className="flex flex-col gap-1 text-[12px] font-bold">
                    Domicilio
                    <input name="homeFee" defaultValue={Number(a.home_fee)} inputMode="numeric" className="h-11 w-28 rounded-[12px] border-[1.5px] border-line-strong bg-white px-3 text-[15px] font-semibold" />
                  </label>
                  <button type="submit" className="min-h-11 rounded-[12px] border border-line-strong bg-white px-4 text-[14px] font-extrabold">
                    Guardar tarifas
                  </button>
                </form>
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
