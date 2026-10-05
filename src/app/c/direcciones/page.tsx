import type { Metadata } from "next";
import { Card, EmptyState, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { archiveAddressAction, setDefaultAddressAction } from "./actions";
import { AddressForm } from "./address-form";

export const metadata: Metadata = { title: "Mis direcciones", robots: { index: false } };

export default async function AddressesPage() {
  await requireRole(["client"]);
  const supabase = await createClient();
  const [{ data: addresses }, { data: cities }] = await Promise.all([
    supabase
      .from("addresses")
      .select("id, label, line1, neighborhood, city_name, department, dane_code, is_default")
      .is("deleted_at", null)
      .order("is_default", { ascending: false }),
    supabase.from("coverage_areas").select("dane_code, city_name").eq("is_active", true).order("city_name"),
  ]);
  const list = addresses ?? [];
  const coverage = new Set((cities ?? []).map((c) => c.dane_code));
  return (
    <section className="flex flex-col gap-6">
      <PageTitle
        title="Mis direcciones"
        subtitle="Las usamos para recoger y entregar tu equipo o ir a tu domicilio."
      />
      <div className="grid gap-6 md:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-3">
          {list.length === 0 ? (
            <EmptyState
              title="Aún no tienes direcciones"
              text="Agrega una para solicitar servicios presenciales."
            />
          ) : (
            list.map((a) => (
              <Card key={a.id} className="flex flex-col gap-3">
                <div>
                  <div className="text-[17px] font-extrabold">
                    {a.label}{" "}
                    {a.is_default ? (
                      <span className="ml-1 rounded-full bg-[#E3F3E8] px-2 py-0.5 text-[12px] text-[#1F6B3A]">
                        Principal
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[14px] font-semibold text-muted">
                    {a.line1}
                    {a.neighborhood ? `, ${a.neighborhood}` : ""} · {a.city_name}
                  </div>
                  {!coverage.has(a.dane_code) ? (
                    <div className="mt-1 text-[13px] font-bold text-[#7A3E00]">
                      Sin cobertura presencial: solo soporte remoto.
                    </div>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {!a.is_default ? (
                    <form action={setDefaultAddressAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button
                        type="submit"
                        className="min-h-11 rounded-[14px] border border-line-strong bg-white px-4 text-[14px] font-extrabold"
                      >
                        Hacer principal
                      </button>
                    </form>
                  ) : null}
                  <form action={archiveAddressAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button
                      type="submit"
                      className="min-h-11 rounded-[14px] border border-line-strong bg-white px-4 text-[14px] font-extrabold text-[#9A2B1E]"
                    >
                      Quitar
                    </button>
                  </form>
                </div>
              </Card>
            ))
          )}
        </div>
        <Card className="h-fit">
          <h2 className="m-0 mb-4 text-[19px] font-extrabold">Agregar dirección</h2>
          <AddressForm cities={cities ?? []} />
        </Card>
      </div>
    </section>
  );
}
