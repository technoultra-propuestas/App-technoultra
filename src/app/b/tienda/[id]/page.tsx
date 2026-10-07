import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, fmtDateTime, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { linkInstallationAction, unlinkInstallationAction } from "../actions";
import { InfoList, Panel } from "@/components/ui/detail";
import { money } from "@/components/ui/layout";
import { ProductForm, SourceProductForm, StockForm } from "../forms";

export const metadata: Metadata = { title: "Producto", robots: { index: false } };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["superadmin"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const { data: p } = await supabase.from("products").select("*").eq("id", id.data).is("deleted_at", null).maybeSingle();
  if (!p) notFound();
  const [{ data: cats }, { data: inv }, { data: moves }, { data: links }, { data: services }] = await Promise.all([
    supabase.from("product_categories").select("id, name").order("sort_order"),
    supabase.from("inventory").select("stock_on_hand, reorder_level").eq("product_id", p.id).maybeSingle(),
    supabase.from("inventory_movements").select("id, delta, reason, note, created_at").eq("product_id", p.id).order("created_at", { ascending: false }).limit(15),
    supabase.from("product_service_links").select("service_id, services(name)").eq("product_id", p.id),
    supabase.from("services").select("id, name").eq("is_active", true).neq("price_mode", "quote").order("name"),
  ]);
  const isSource = p.source !== null;
  const { data: src } = isSource ? await supabase.from("product_source").select("source_price, source_stock, first_seen_at, last_seen_at, deactivated_at, deactivation_reason").eq("product_id", p.id).maybeSingle() : { data: null };
  const { data: hist } = isSource ? await supabase.from("product_price_history").select("id, source_price, customer_price, created_at").eq("product_id", p.id).order("created_at", { ascending: false }).limit(8) : { data: [] };
  const linked = new Set((links ?? []).map((l) => l.service_id));
  return (
    <section className="grid gap-6 md:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-6">
        <PageTitle title={p.name} />
        {isSource ? (
          <>
            <Panel title="Datos de la fuente (solo lectura)" hint={`Producto sincronizado desde ${p.source}. Nombre, categoría, imagen y precio los define la fuente.`}>
              <InfoList
                rows={[
                  { label: "Referencia", value: p.source_ref },
                  { label: "Marca", value: p.brand },
                  { label: "Precio fuente", value: src ? money(src.source_price) : null },
                  { label: "Precio TechnoUltra (+20 %)", value: money(p.price) },
                  { label: "Disponibilidad en la fuente", value: p.source_available ? `Disponible (cantidad reportada: ${src?.source_stock ?? "—"}; se muestra como «1 unidad disponible»)` : `Oculto: ${src?.deactivation_reason === "missing_from_source" ? "ya no aparece en la fuente" : "sin stock"}${src?.deactivated_at ? ` desde ${fmtDateTime(src.deactivated_at)}` : ""}` },
                  { label: "Visibilidad TechnoUltra", value: p.is_active ? "Visible (decisión manual)" : "Oculto por el administrador" },
                  { label: "Resultado público", value: p.is_active && p.source_available ? "Se muestra en la tienda" : "No se muestra" },
                  { label: "Última vez visto", value: src ? fmtDateTime(src.last_seen_at) : null },
                  { label: "Última sincronización", value: p.last_synced_at ? fmtDateTime(p.last_synced_at) : null },
                ]}
              />
            </Panel>
            <Panel title="Ajustes del administrador">
              <SourceProductForm id={p.id} isActive={p.is_active} warrantyDays={p.warranty_days} isFeatured={p.is_featured} featuredRank={p.featured_rank} />
            </Panel>
            <Panel title="Historial de precios">
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px] font-semibold">
                {(hist ?? []).map((h) => (
                  <li key={h.id} className="flex justify-between gap-3"><span>Fuente {money(h.source_price)} → cliente {money(h.customer_price)}</span><span className="text-muted">{fmtDateTime(h.created_at)}</span></li>
                ))}
              </ul>
            </Panel>
          </>
        ) : (
          <Card>
            <ProductForm values={p} categories={cats ?? []} />
          </Card>
        )}
      </div>
      <aside className="flex flex-col gap-4">
        {isSource ? null : (
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Inventario · {inv?.stock_on_hand ?? 0} en stock</h2>
          <StockForm productId={p.id} />
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] font-semibold">
            {(moves ?? []).map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span>
                  {m.delta > 0 ? "+" : ""}
                  {m.delta} · {m.reason}
                  {m.note ? ` · ${m.note}` : ""}
                </span>
                <span className="text-muted">{fmtDateTime(m.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
        )}
        {isSource ? null : (
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Instalación asociada</h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px] font-semibold">
            {(links ?? []).map((l) => (
              <li key={l.service_id} className="flex items-center justify-between gap-2">
                <span>{(l.services as unknown as { name: string } | null)?.name}</span>
                <form action={unlinkInstallationAction}>
                  <input type="hidden" name="productId" value={p.id} />
                  <input type="hidden" name="serviceId" value={l.service_id} />
                  <button type="submit" className="text-[13px] font-bold text-[#9A2B1E] underline">
                    Quitar
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <form action={linkInstallationAction} className="flex gap-2">
            <input type="hidden" name="productId" value={p.id} />
            <select name="serviceId" className="h-12 min-w-0 flex-1 rounded-[12px] border-[1.5px] border-line-strong bg-white px-3 text-[14px]">
              {(services ?? []).filter((s) => !linked.has(s.id)).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="submit" className="min-h-12 rounded-[12px] bg-ink px-4 text-[14px] font-extrabold text-white">
              Asociar
            </button>
          </form>
        </Card>
        )}
      </aside>
    </section>
  );
}
