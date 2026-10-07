import type { Metadata } from "next";
import { Panel } from "@/components/ui/detail";
import { fmtDateTime } from "@/components/ui/layout";
import { SegmentTabs } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { DEFAULT_SHOP_SETTINGS } from "@/lib/shop/settings";
import { createClient } from "@/lib/supabase/server";
import { deleteBannerAction, saveShopCategoryAction, toggleBannerAction } from "../shop-actions";
import { BannerForm, ShopSettingsForm } from "../shop-forms";

export const metadata: Metadata = { title: "Tienda · Shop", robots: { index: false } };

const STORE_TABS = [
  { key: "pedidos", label: "Pedidos", href: "/b/pedidos" },
  { key: "productos", label: "Productos", href: "/b/tienda" },
  { key: "shop", label: "Shop", href: "/b/tienda/shop" },
  { key: "sync", label: "Sincronización", href: "/b/tienda/sincronizacion" },
];

const nowMs = () => Date.now();

/** Administración del SHOP: ajustes y textos, envío, mensaje de WhatsApp, banners y categorías destacadas. Solo SUPERADMIN. */
export default async function ShopAdminPage() {
  await requireRole(["superadmin"]);
  const supabase = await createClient();
  const [{ data: settings }, { data: banners }, { data: cats }] = await Promise.all([
    supabase.from("shop_settings").select("title, subtitle, show_featured, shipping_enabled, shipping_title, shipping_urban_fee, shipping_outside_fee, shipping_note, whatsapp_intro, whatsapp_closing").maybeSingle(),
    supabase.from("shop_banners").select("*").order("priority", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("product_categories").select("id, name, sort_order, is_featured, is_active").order("sort_order").order("name"),
  ]);
  const now = nowMs();
  const live = (b:{ is_active: boolean; starts_at: string | null; ends_at: string | null }) => b.is_active && (!b.starts_at || new Date(b.starts_at).getTime() <= now) && (!b.ends_at || new Date(b.ends_at).getTime() > now);
  return (
    <section className="flex flex-col gap-5">
      <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">Shop</h1>
      <SegmentTabs label="Secciones de la tienda" items={STORE_TABS} active="shop" />
      <p className="m-0 max-w-[760px] text-[14px] leading-normal text-muted">Todo lo que ve el público en <strong>/tienda</strong> se administra aquí. La identidad (tipografía, colores y estilo) la fija el sistema de diseño de TechnoUltra: aquí eliges entre los estilos permitidos.</p>

      <Panel title="Banner promocional" hint="Si ninguno está activo y vigente, el Shop no muestra banner. Se muestra el de mayor prioridad.">
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {(banners ?? []).map((b) => (
            <li key={b.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[15px] font-extrabold">{b.title}</span>
                <span className={`rounded-full px-3 py-1 text-[12.5px] font-extrabold ${live(b) ? "bg-ok-soft text-ok" : b.is_active ? "bg-warn-soft text-warn" : "bg-paper text-muted"}`}>{live(b) ? "Visible ahora" : b.is_active ? "Activo (fuera de fechas)" : "Desactivado"}</span>
              </div>
              <span className="text-[12.5px] text-muted">
                Prioridad {b.priority}
                {b.starts_at ? ` · desde ${fmtDateTime(b.starts_at)}` : ""}
                {b.ends_at ? ` · hasta ${fmtDateTime(b.ends_at)}` : ""}
              </span>
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-extrabold underline decoration-brand underline-offset-[3px]">Editar</summary>
                <div className="pt-2">
                  <BannerForm v={b} />
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <form action={toggleBannerAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="active" value={b.is_active ? "false" : "true"} />
                  <button type="submit" className="min-h-11 rounded-[12px] border border-line-strong bg-white px-4 text-[14px] font-extrabold">{b.is_active ? "Desactivar" : "Activar"}</button>
                </form>
                <form action={deleteBannerAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <button type="submit" className="min-h-11 rounded-[12px] border border-line-strong bg-white px-4 text-[14px] font-extrabold text-danger">Eliminar</button>
                </form>
              </div>
            </li>
          ))}
          {(banners ?? []).length === 0 ? <li className="py-3 text-[14px] text-muted">Todavía no hay banners. Crea el primero abajo.</li> : null}
        </ul>
        <details className="rounded-[14px] border border-line p-4">
          <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-extrabold">Nuevo banner</summary>
          <div className="pt-3">
            <BannerForm />
          </div>
        </details>
      </Panel>

      <Panel title="Textos, envíos y WhatsApp">
        <ShopSettingsForm v={settings ?? DEFAULT_SHOP_SETTINGS} />
      </Panel>

      <Panel title="Categorías del Shop" hint="Orden, visibilidad y destacadas. Los nombres y subcategorías vienen del catálogo importado y no se editan aquí.">
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {(cats ?? []).map((c) => (
            <li key={c.id} className="py-2.5">
              <form action={saveShopCategoryAction} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={c.id} />
                <span className="min-w-[150px] flex-1 text-[14.5px] font-extrabold">{c.name}</span>
                <label className="flex min-h-11 items-center gap-2 text-[13px] font-bold">
                  Orden
                  <input name="sortOrder" inputMode="numeric" defaultValue={c.sort_order} className="h-11 w-20 rounded-[12px] border-[1.5px] border-line-strong bg-white px-3 text-[15px] font-semibold" />
                </label>
                <label className="flex min-h-11 items-center gap-2 text-[13px] font-bold">
                  <input type="checkbox" name="isFeatured" defaultChecked={c.is_featured} className="h-5 w-5 accent-brand" /> Destacada
                </label>
                <label className="flex min-h-11 items-center gap-2 text-[13px] font-bold">
                  <input type="checkbox" name="isActive" defaultChecked={c.is_active} className="h-5 w-5 accent-brand" /> Visible
                </label>
                <button type="submit" className="min-h-11 rounded-[12px] bg-ink px-4 text-[13.5px] font-extrabold text-white">Guardar</button>
              </form>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
}
