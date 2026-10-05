"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { clearCart, readCart, writeCart, type CartLine } from "@/components/store/cart";
import { Alert, SubmitButton } from "@/components/ui/form";
import { Card, money, Select } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { createOrderAction, loadCartAction, type LoadedLine } from "../pedidos/actions";

type Addr = { id: string; label: string; covered: boolean; fee: number };

export function CartView({ addresses }: { addresses: Addr[] }) {
  const [state, action] = useActionState(createOrderAction, initialState);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [lines, setLines] = useState<LoadedLine[]>([]);
  const [ready, setReady] = useState(false);
  const [method, setMethod] = useState<"pickup_store" | "delivery">("pickup_store");
  const [addressId, setAddressId] = useState(addresses.find((a) => a.covered)?.id ?? addresses[0]?.id ?? "");

  useEffect(() => {
    const c = readCart();
    void loadCartAction(c.map((l) => l.productId)).then((l) => {
      setCart(c);
      setLines(l);
      setReady(true);
    });
  }, []);

  const update = (next: CartLine[]) => {
    setCart(next);
    writeCart(next);
  };
  const byId = new Map(lines.map((l) => [l.productId, l]));
  const visible = cart.filter((c) => byId.has(c.productId));
  const addr = addresses.find((a) => a.id === addressId);
  const subtotal = visible.reduce((s, c) => {
    const l = byId.get(c.productId)!;
    return s + (l.price + (c.install && l.installPrice ? l.installPrice : 0)) * c.qty;
  }, 0);
  const needsCoverage = method === "delivery" || visible.some((c) => c.install);
  const blocked = needsCoverage && (!addr || !addr.covered);
  const shipping = method === "delivery" && addr?.covered ? addr.fee : 0;

  if (!ready) return <p className="m-0 text-muted">Cargando…</p>;
  if (visible.length === 0)
    return (
      <Card className="flex flex-col gap-3">
        <div className="text-[18px] font-extrabold">Tu carrito está vacío</div>
        <Link href="/c/tienda" className="inline-flex min-h-12 w-fit items-center rounded-2xl bg-brand px-5 text-[16px] font-extrabold text-ink no-underline">
          Ir a la tienda
        </Link>
      </Card>
    );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="cart" value={JSON.stringify(visible)} />
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {visible.map((c) => {
          const l = byId.get(c.productId)!;
          return (
            <li key={c.productId}>
              <Card className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[16px] font-extrabold">{l.name}</div>
                    <div className="text-[14px] font-semibold text-muted">{money(l.price)} c/u</div>
                    {!l.inStock ? <div className="text-[13px] font-bold text-[#9A2B1E]">Sin stock por ahora</div> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label="Quitar uno" onClick={() => update(c.qty > 1 ? cart.map((x) => (x.productId === c.productId ? { ...x, qty: x.qty - 1 } : x)) : cart.filter((x) => x.productId !== c.productId))} className="h-11 w-11 rounded-[12px] border border-line-strong bg-white text-[18px] font-extrabold">−</button>
                    <span className="w-6 text-center text-[16px] font-extrabold">{c.qty}</span>
                    <button type="button" aria-label="Agregar uno" onClick={() => update(cart.map((x) => (x.productId === c.productId ? { ...x, qty: Math.min(99, x.qty + 1) } : x)))} className="h-11 w-11 rounded-[12px] border border-line-strong bg-white text-[18px] font-extrabold">+</button>
                  </div>
                </div>
                {l.installName && l.installPrice ? (
                  <label className="flex items-center gap-3 text-[14px] font-semibold">
                    <input type="checkbox" checked={Boolean(c.install)} onChange={(e) => update(cart.map((x) => (x.productId === c.productId ? { ...x, install: e.target.checked } : x)))} className="h-6 w-6 accent-[#FF8A00]" />
                    Agregar {l.installName} (+{money(l.installPrice)})
                  </label>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>

      <Card className="flex flex-col gap-3">
        <Select label="¿Cómo lo recibes?" name="method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="pickup_store">Recoger en el local</option>
          <option value="delivery">Entrega a domicilio</option>
        </Select>
        {needsCoverage ? (
          addresses.length === 0 ? (
            <Alert>
              Agrega una dirección para la entrega o la instalación.{" "}
              <Link href="/c/direcciones" className="underline">
                Agregar dirección
              </Link>
            </Alert>
          ) : (
            <Select label="Dirección" name="addressId" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                  {a.covered ? "" : " · sin cobertura"}
                </option>
              ))}
            </Select>
          )
        ) : null}
        {blocked && addr ? <Alert>Actualmente no tenemos cobertura de entrega o instalación en esa ciudad. Puedes recoger en el local.</Alert> : null}
        <div className="flex flex-col gap-1 border-t border-line pt-3 text-[15px] font-semibold">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          {method === "delivery" ? <div className="flex justify-between"><span>Envío</span><span>{money(shipping)}</span></div> : null}
          <div className="flex justify-between text-[19px] font-extrabold"><span>Total estimado</span><span>{money(subtotal + shipping)}</span></div>
        </div>
      </Card>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingText="Creando pedido…">Continuar al pago</SubmitButton>
      <button type="button" onClick={() => { clearCart(); setCart([]); }} className="min-h-11 border-none bg-transparent text-[14px] font-bold text-muted">Vaciar carrito</button>
    </form>
  );
}
