import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { saveTaxAction, saveUrgencyAction } from "./actions";

export const metadata: Metadata = { title: "Configuración comercial", robots: { index: false } };

const DAYS: [number, string][] = [[1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [7, "Dom"]];
const MODS: [string, string][] = [["store", "Taller"], ["pickup", "Recogida"], ["home", "Domicilio"], ["remote", "Remoto"]];
const field = "h-11 rounded-[12px] border border-line-strong bg-white px-3 text-[15px]";
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/** Impuestos y recargos. Todo vive en Supabase; el domicilio se configura por municipio en Cobertura. Solo administración. */
export default async function CommercialPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRole(["admin"]);
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

      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-[19px] font-extrabold">IVA</h2>
        <p className="m-0 text-[14px] text-ink-2">
          Los precios del catálogo y la tienda son siempre el precio FINAL al cliente. Hoy no se agrega ni se muestra IVA. Si activas «Responsable de IVA», el IVA se desglosa del total (informativo) y los precios NO cambian.
        </p>
        <form action={saveTaxAction} className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-3 text-[15px] font-semibold">
            <input type="checkbox" name="responsible" defaultChecked={responsible} className="h-6 w-6 accent-[#FF8A00]" />
            Responsable de IVA
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-bold">
            Tarifa IVA (%)
            <input name="rate" defaultValue={rate} inputMode="decimal" className={`${field} w-28`} />
          </label>
          <button className="min-h-11 rounded-[12px] bg-ink px-5 text-[14px] font-extrabold text-white">Guardar</button>
        </form>
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
            <form action={saveUrgencyAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={l.id} />
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-[13px] font-bold">
                  Nombre
                  <input name="label" defaultValue={l.label} className={`${field} w-56`} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-bold">
                  Porcentaje (%)
                  <input name="percent" defaultValue={Number(l.percent)} inputMode="decimal" className={`${field} w-24`} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-bold">
                  Valor fijo ($)
                  <input name="fixed" defaultValue={Number(l.fixed_amount)} inputMode="numeric" className={`${field} w-28`} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-bold">
                  Mínimo ($)
                  <input name="min" defaultValue={Number(l.min_amount)} inputMode="numeric" className={`${field} w-28`} />
                </label>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-[13px] font-bold">
                  Desde (hora)
                  <input name="start" type="time" defaultValue={hhmm(l.start_time)} className={field} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-bold">
                  Hasta (hora)
                  <input name="end" type="time" defaultValue={hhmm(l.end_time)} className={field} />
                </label>
                <span className="text-[12px] text-muted">Sin horario = todo el día. Si «hasta» es menor que «desde» cruza la medianoche (ej. 18:00–07:00 para fuera de horario).</span>
              </div>
              <fieldset className="flex flex-wrap gap-3 border-0 p-0">
                <legend className="mb-1 text-[13px] font-bold">Días</legend>
                {DAYS.map(([d, name]) => (
                  <label key={d} className="flex items-center gap-1.5 text-[14px] font-semibold">
                    <input type="checkbox" name="days" value={d} defaultChecked={l.days.includes(d)} className="h-5 w-5 accent-[#FF8A00]" />
                    {name}
                  </label>
                ))}
              </fieldset>
              <fieldset className="flex flex-wrap gap-3 border-0 p-0">
                <legend className="mb-1 text-[13px] font-bold">Modalidades</legend>
                {MODS.map(([m, name]) => (
                  <label key={m} className="flex items-center gap-1.5 text-[14px] font-semibold">
                    <input type="checkbox" name="modalities" value={m} defaultChecked={l.modalities.includes(m as "store")} className="h-5 w-5 accent-[#FF8A00]" />
                    {name}
                  </label>
                ))}
              </fieldset>
              <label className="flex flex-col gap-1 text-[13px] font-bold">
                Servicios a los que aplica (ninguno seleccionado = todos)
                <select name="services" multiple defaultValue={[...mine]} size={5} className="rounded-[12px] border border-line-strong bg-white p-2 text-[14px] font-medium">
                  {(services ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-3 text-[15px] font-semibold">
                  <input type="checkbox" name="active" defaultChecked={l.is_active} className="h-6 w-6 accent-[#FF8A00]" />
                  Activo (disponible al cotizar)
                </label>
                <button className="min-h-11 rounded-[12px] bg-ink px-5 text-[14px] font-extrabold text-white">Guardar nivel</button>
              </div>
            </form>
          </Card>
        );
      })}
    </section>
  );
}
