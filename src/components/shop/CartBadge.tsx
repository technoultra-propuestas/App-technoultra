"use client";

import Link from "next/link";
import { cartCount } from "@/lib/shop/cart";
import { useShopCart } from "@/lib/shop/use-shop-cart";

/** Acceso al carrito con contador. Visible en todas las pantallas públicas del SHOP. */
export function CartBadge() {
  const count = cartCount(useShopCart());
  return (
    <Link href="/tienda/carrito" aria-label={count ? `Carrito, ${count} ${count === 1 ? "producto" : "productos"}` : "Carrito vacío"} className="press relative inline-flex h-11 min-w-11 items-center justify-center rounded-ctl border border-line bg-white px-3 text-ink no-underline">
      <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="20" r="1.4" />
        <circle cx="18" cy="20" r="1.4" />
        <path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6" />
      </svg>
      {count > 0 ? <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-extrabold text-ink">{count}</span> : null}
    </Link>
  );
}
