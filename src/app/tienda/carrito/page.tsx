import type { Metadata } from "next";
import { loadShopSettings } from "@/lib/shop/settings";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Tu carrito", robots: { index: false } };

export default async function ShopCartPage() {
  const s = await loadShopSettings();
  return (
    <>
      <h1 className="m-0 mb-5 text-[28px] font-extrabold tracking-[-0.03em] sm:text-[34px]">Tu carrito</h1>
      <CartView
        copy={{ intro: s.whatsapp_intro, closing: s.whatsapp_closing }}
        shipping={{ enabled: s.shipping_enabled, title: s.shipping_title, urban: s.shipping_urban_fee, outside: s.shipping_outside_fee, note: s.shipping_note }}
      />
    </>
  );
}
