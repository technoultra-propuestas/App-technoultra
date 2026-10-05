"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { allow, TOO_MANY } from "@/lib/auth/rate-limit";
import type { ActionState } from "@/lib/auth/schemas";
import { serverEnv } from "@/lib/env.server";
import { getPublicEnv } from "@/lib/env.public";
import { createPreference } from "@/lib/payments/mercadopago";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const cartSchema = z
  .array(z.object({ productId: z.string().uuid(), qty: z.number().int().min(1).max(99), install: z.boolean().optional() }))
  .min(1)
  .max(30);

const ORDER_ERRORS: [RegExp, string][] = [
  [/insufficient_stock/, "Uno de los productos no tiene stock suficiente. Revisa las cantidades."],
  [/out_of_coverage/, "No tenemos cobertura de entrega o instalación en esa ciudad. Puedes recoger en tienda."],
  [/address_required/, "Elige una dirección para la entrega."],
  [/address_not_owned/, "La dirección elegida no es válida."],
  [/product_unavailable/, "Uno de los productos ya no está disponible."],
  [/installation_unavailable/, "Ese producto no tiene instalación disponible."],
];

export type LoadedLine = { productId: string; name: string; price: number; inStock: boolean; installName: string | null; installPrice: number | null };

/** Datos para mostrar el carrito. Los precios mostrados son informativos: el pedido los recalcula siempre en base de datos. */
export async function loadCartAction(ids: string[]): Promise<LoadedLine[]> {
  await assertRole(["client"]);
  const clean = z.array(z.string().uuid()).max(30).safeParse(ids);
  if (!clean.success || clean.data.length === 0) return [];
  const supabase = await createClient();
  const [{ data: products }, { data: flags }, { data: links }] = await Promise.all([
    supabase.from("products").select("id, name, price").in("id", clean.data),
    supabase.rpc("product_stock_flags"),
    supabase.from("product_service_links").select("product_id, services(name, base_price, price_mode, is_active)").in("product_id", clean.data),
  ]);
  const stock = new Map(((flags ?? []) as { product_id: string; in_stock: boolean }[]).map((f) => [f.product_id, f.in_stock]));
  return (products ?? []).map((p) => {
    const l = (links ?? []).find((x) => x.product_id === p.id);
    const s = (l?.services as unknown as { name: string; base_price: number | null; price_mode: string; is_active: boolean } | null) ?? null;
    return { productId: p.id, name: p.name, price: Number(p.price), inStock: stock.get(p.id) ?? false, installName: s && s.is_active && s.price_mode !== "quote" ? s.name : null, installPrice: s?.base_price ? Number(s.base_price) : null };
  });
}

export async function createOrderAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const profile = await assertRole(["client"]);
  const method = z.enum(["pickup_store", "delivery"]).safeParse(fd.get("method"));
  let cart: z.infer<typeof cartSchema>;
  try {
    cart = cartSchema.parse(JSON.parse(String(fd.get("cart") ?? "[]")));
  } catch {
    return { ok: false, error: "Tu carrito no es válido." };
  }
  if (!method.success) return { ok: false, error: "Elige cómo recibir tu pedido." };
  const addressId = z.string().uuid().safeParse(fd.get("addressId"));
  if (!(await allow("order-create", profile.id, 15, 3600))) return { ok: false, error: TOO_MANY };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_items: cart.map((c) => ({ product_id: c.productId, qty: c.qty, install: Boolean(c.install) })),
    p_delivery_method: method.data,
    p_address_id: addressId.success ? addressId.data : null,
    p_notes: String(fd.get("notes") ?? "").slice(0, 500) || null,
  });
  if (error || !data) return { ok: false, error: ORDER_ERRORS.find(([re]) => re.test(error?.message ?? ""))?.[1] ?? "No pudimos crear tu pedido. Inténtalo de nuevo." };
  redirect(`/c/pedidos/${data}`);
}

const idSchema = z.string().uuid();

/**
 * Inicia el pago con Mercado Pago. El monto lo fija la base de datos (begin_payment) a partir del pedido; el navegador
 * solo indica QUÉ pedido pagar y se verifica que sea suyo. El estado "pagado" jamás se decide aquí: lo confirma el webhook.
 */
export async function startPaymentAction(fd: FormData): Promise<void> {
  const profile = await assertRole(["client"]);
  const orderId = idSchema.safeParse(fd.get("orderId"));
  if (!orderId.success) return;
  if (!(await allow("pay-start", profile.id, 10, 3600))) redirect(`/c/pedidos/${orderId.data}?pago=limite`);

  let token: string;
  try {
    token = serverEnv.mercadopago().MERCADOPAGO_ACCESS_TOKEN;
  } catch {
    redirect(`/c/pedidos/${orderId.data}?pago=no_configurado`);
  }
  const admin = createAdminClient();
  const { data: pay, error } = await admin.rpc("begin_payment", { p_order: orderId.data, p_actor: profile.id });
  const row = Array.isArray(pay) ? pay[0] : pay;
  if (error || !row) redirect(`/c/pedidos/${orderId.data}?pago=no_disponible`);

  const { data: items } = await admin.from("order_items").select("id, description, qty, unit_price").eq("order_id", orderId.data);
  const { data: order } = await admin.from("orders").select("shipping_fee, expires_at").eq("id", orderId.data).single();
  const lines = (items ?? []).map((i) => ({ id: i.id, title: i.description, quantity: i.qty, unit_price: Number(i.unit_price) }));
  if (order && Number(order.shipping_fee) > 0) lines.push({ id: "envio", title: "Envío", quantity: 1, unit_price: Number(order.shipping_fee) });

  const pref = await createPreference(
    { externalReference: row.external_reference, idempotencyKey: `pref-${row.payment_id}`, items: lines, payerEmail: profile.email, appUrl: getPublicEnv().NEXT_PUBLIC_APP_URL, orderId: orderId.data, expiresAt: order?.expires_at ? new Date(order.expires_at) : null },
    token,
  );
  if (!pref) redirect(`/c/pedidos/${orderId.data}?pago=error`);
  redirect(pref.init_point);
}

export async function cancelOrderAction(fd: FormData): Promise<void> {
  await assertRole(["client"]);
  const id = idSchema.safeParse(fd.get("orderId"));
  if (!id.success) return;
  await (await createClient()).rpc("cancel_order", { p_order: id.data });
  revalidatePath(`/c/pedidos/${id.data}`);
}
