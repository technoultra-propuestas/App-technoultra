"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProductImage } from "@/components/store/ProductImage";
import { OUTSIDE_ZONES_TEXT } from "@/lib/catalog/config";
import { copFormat } from "@/lib/catalog/normalize";
import { cartWhatsappUrl, type WhatsappCopy } from "@/lib/catalog/whatsapp";
import { haptic } from "@/lib/haptics";
import { MAX_QTY, readCart, removeLine, setQty, writeCart } from "@/lib/shop/cart";
import { useShopCart } from "@/lib/shop/use-shop-cart";

type P = { id: string; slug: string; name: string; brand: string | null; price: number; image_url: string | null; source_ref: string | null };
type Props = { copy: WhatsappCopy; shipping: { enabled: boolean; title: string; urban: number; outside: number; note: string } };

/**
 * Carrito del SHOP. Las líneas (id + cantidad) viven en el navegador; nombre, imagen y precio se consultan al servidor, así que un producto
 * agotado u oculto desaparece solo y el precio mostrado es siempre el vigente. «Comprar por WhatsApp» genera UN mensaje con todo.
 */
export function CartView({ copy, shipping }: Props) {
  const cart = useShopCart();
  const ids = useMemo(() => cart.map((l) => l.productId).join(","), [cart]);
  const [products, setProducts] = useState<Record<string, P>>({});
  // Lista de ids para la que YA se obtuvieron los datos del servidor. Mientras no coincida con el carrito actual, no se poda nada.
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // El carrito NO es un checkout: «enviado» solo significa que se abrió WhatsApp con el pedido; no hay cobro ni pedido confirmado.
  const [sent, setSent] = useState(false);
  const loading = ids !== "" && fetchedFor !== ids && !failed;

  useEffect(() => {
    if (!ids) return;
    const ctrl = new AbortController();
    fetch(`/api/tienda/carrito?ids=${ids}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((j: { products: P[] }) => {
        setProducts(Object.fromEntries(j.products.map((p) => [p.id, p])));
        setFailed(false);
        setFetchedFor(ids);
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name !== "AbortError") setFailed(true);
      });
    return () => ctrl.abort();
  }, [ids]);

  // Productos que ya no están disponibles se quitan del carrito (el servidor no los devuelve), pero SOLO tras una respuesta real del servidor
  // para este mismo carrito: nunca se vacía el carrito por no haber cargado todavía.
  useEffect(() => {
    if (failed || !ids || fetchedFor !== ids) return;
    const live = cart.filter((l) => products[l.productId]);
    if (live.length !== cart.length) writeCart(live);
  }, [failed, ids, fetchedFor, cart, products]);

  const lines = cart.filter((l) => products[l.productId]).map((l) => ({ ...l, p: products[l.productId] }));
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const wa = cartWhatsappUrl(lines.map((l) => ({ name: l.p.name, ref: l.p.source_ref, price: l.p.price, qty: l.qty })), copy);

  if (cart.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-white p-6 shadow-card">
        <div className="text-[18px] font-extrabold">Tu carrito está vacío</div>
        <p className="m-0 text-[15px] text-muted">Agrega productos desde el catálogo y compra por WhatsApp cuando quieras.</p>
        <Link href="/tienda" className="press inline-flex min-h-12 items-center rounded-[14px] bg-brand px-5 text-[15px] font-extrabold text-ink no-underline">Ver el catálogo</Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <section aria-label="Productos del carrito" className="flex flex-col gap-3">
        {loading && lines.length === 0 ? <p role="status" className="m-0 text-[14px] font-semibold text-muted">Cargando tu carrito…</p> : null}
        {failed ? <p role="alert" className="m-0 rounded-[14px] bg-warn-soft px-4 py-3 text-[14px] font-bold text-warn">No pudimos actualizar los precios. Revisa tu conexión e inténtalo de nuevo.</p> : null}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {lines.map(({ p, qty }) => (
            <li key={p.id} className="flex gap-3 rounded-card border border-line bg-white p-3 shadow-card">
              <Link href={`/tienda/producto/${p.slug}`} className="flex-none" aria-label={p.name}>
                <ProductImage src={p.image_url} alt={p.name} width={200} className="h-24 w-24 rounded-[12px] border border-line" />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {p.brand ? <span className="text-[11.5px] font-extrabold uppercase tracking-[0.04em] text-muted">{p.brand}</span> : null}
                <Link href={`/tienda/producto/${p.slug}`} className="line-clamp-2 text-[14.5px] font-extrabold leading-snug text-ink no-underline">{p.name}</Link>
                <span className="text-[16px] font-extrabold">{copFormat(p.price)}</span>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center rounded-[12px] border border-line-strong bg-white" role="group" aria-label={`Cantidad de ${p.name}`}>
                    <button type="button" aria-label="Quitar una unidad" onClick={() => { haptic("tap"); writeCart(setQty(readCart(), p.id, qty - 1)); }} className="press flex h-11 w-11 items-center justify-center text-[20px] font-extrabold">−</button>
                    <span aria-live="polite" className="min-w-8 text-center text-[15px] font-extrabold">{qty}</span>
                    <button type="button" aria-label="Agregar una unidad" disabled={qty >= MAX_QTY} onClick={() => { haptic("tap"); writeCart(setQty(readCart(), p.id, qty + 1)); }} className="press flex h-11 w-11 items-center justify-center text-[20px] font-extrabold disabled:opacity-40">+</button>
                  </div>
                  <button type="button" onClick={() => { haptic("tap"); writeCart(removeLine(readCart(), p.id)); }} className="press min-h-11 px-2 text-[13px] font-extrabold text-danger underline decoration-danger/40 underline-offset-[3px]">Eliminar</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[13px] text-muted">Confirmamos la disponibilidad de cada producto y cantidad por WhatsApp.</p>
      </section>

      <aside aria-label="Resumen" className="flex flex-col gap-4 rounded-card border border-line bg-white p-5 shadow-card lg:sticky lg:top-4">
        <h2 className="m-0 text-[18px] font-extrabold">Resumen</h2>
        <div className="flex items-center justify-between text-[15px] font-bold">
          <span>Subtotal</span>
          <span className="text-[20px] font-extrabold">{copFormat(subtotal)}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-[14px] bg-paper p-3.5 text-[13.5px] leading-snug text-ink-2">
          <span className="font-extrabold text-ink">Entrega sujeta a confirmación de ubicación</span>
          {shipping.enabled ? (
            <>
              <span>Cali urbano: {copFormat(shipping.urban)}</span>
              <span>Fuera del perímetro urbano / zonas aledañas ({OUTSIDE_ZONES_TEXT}): {copFormat(shipping.outside)}</span>
              {shipping.note ? <span className="text-muted">{shipping.note}</span> : null}
            </>
          ) : null}
        </div>
        <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => { haptic("tap"); setSent(true); }} aria-disabled={lines.length === 0 || loading} className={`press inline-flex min-h-[54px] items-center justify-center rounded-[14px] bg-brand px-5 text-[16px] font-extrabold text-ink no-underline shadow-card ${lines.length === 0 || loading ? "pointer-events-none opacity-50" : ""}`}>
          {sent ? "Abrir WhatsApp de nuevo" : "Comprar por WhatsApp"}
        </a>
        {sent ? (
          <div role="status" className="flex flex-col gap-1 rounded-[14px] bg-ok-soft p-3.5 text-ok">
            <span className="text-[15px] font-extrabold">✓ Pedido enviado a WhatsApp</span>
            <span className="text-[13.5px] font-semibold leading-snug">Te responderemos en ese chat para confirmar disponibilidad y entrega. Todavía no hay ningún cobro: el pago se coordina contigo allá.</span>
          </div>
        ) : null}
        <Link href="/tienda" className="flex min-h-11 items-center justify-center text-[14px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">Seguir explorando el catálogo</Link>
      </aside>
    </div>
  );
}
