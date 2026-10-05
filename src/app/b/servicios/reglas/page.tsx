import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reglas de precios y fuentes", robots: { index: false } };

/** Referencia interna de la carga inicial del catálogo (solo administración). No automatiza cobros: son recomendaciones del tarifario. */
export default async function PricingRulesPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const [{ data: rules }, { data: sources }] = await Promise.all([
    supabase.from("catalog_pricing_rules").select("id, position, rule, recommendation").order("position"),
    supabase.from("catalog_sources").select("id, name, url, usage").order("name"),
  ]);
  return (
    <section className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
      <PageTitle title="Reglas de precios y fuentes" subtitle="Referencia del tarifario cargado. Son recomendaciones: el negocio decide cuáles aplicar." />
      <Card>
        <h2 className="m-0 mb-3 text-[19px] font-extrabold">Reglas</h2>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {(rules ?? []).map((r) => (
            <li key={r.id} className="text-[14px] leading-snug">
              <strong>{r.rule}.</strong> {r.recommendation}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="m-0 mb-3 text-[19px] font-extrabold">Fuentes</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
          {(sources ?? []).map((s) => (
            <li key={s.id}>
              <strong>{s.name}</strong>
              {s.usage ? ` — ${s.usage}` : ""}
              <br />
              <span className="break-all text-muted">{s.url}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Link href="/b/servicios" className="text-[14px] font-bold">
        Volver al catálogo
      </Link>
    </section>
  );
}
