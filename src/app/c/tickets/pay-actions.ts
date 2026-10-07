"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { allow } from "@/lib/auth/rate-limit";
import { assertRole } from "@/lib/auth/session";
import { getPublicEnv } from "@/lib/env.public";
import { serverEnv } from "@/lib/env.server";
import { createOrder } from "@/lib/payments/mercadopago";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ kind: z.enum(["diagnosis", "quote", "service"]), ticketId: z.string().uuid(), ref: z.string().uuid() });

/** Códigos de error de la BD → resultado que se muestra al cliente (nunca el mensaje interno). */
const REASONS: [RegExp, string][] = [
  [/diagnosis_already_paid|quote_already_paid|service_already_paid/, "ya_pagado"],
  [/quote_not_payable|ticket_closed|ticket_not_diagnosis|ticket_is_diagnosis|service_not_payable/, "no_disponible"],
  [/nothing_to_pay/, "sin_saldo"],
];

/**
 * Inicia el pago en línea (Mercado Pago) de un diagnóstico o de una cotización aprobada. El navegador solo indica QUÉ se paga y
 * a qué ticket pertenece; el importe, el titular y el estado salen de la base de datos (begin_service_payment). El estado
 * «pagado» jamás se decide aquí: lo confirma el webhook verificado (o la conciliación del cron).
 */
export async function startServicePaymentAction(fd: FormData): Promise<void> {
  const profile = await assertRole(["client"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return;
  const { kind, ticketId, ref } = parsed.data;
  const back = (r: string): never => redirect(`/c/tickets/${ticketId}?pago=${r}`);
  if (!(await allow("pay-service-start", profile.id, 10, 3600))) back("limite");

  let token: string;
  try {
    token = serverEnv.mercadopago().MERCADOPAGO_ACCESS_TOKEN;
  } catch {
    return back("no_configurado"); // todavía no hay credenciales de Mercado Pago
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("begin_service_payment", { p_actor: profile.id, p_kind: kind, p_ref: ref });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    if (error) console.error("pay.begin", kind, error.code, error.message);
    return back(REASONS.find(([re]) => re.test(error?.message ?? ""))?.[1] ?? "no_disponible");
  }
  const order = await createOrder(
    {
      externalReference: row.external_reference,
      idempotencyKey: `ord-${row.payment_id}`,
      items: [{ title: row.title, quantity: 1, unit_price: Number(row.amount) }],
      totalAmount: Number(row.amount),
      description: row.title,
      payerEmail: profile.email,
      appUrl: getPublicEnv().NEXT_PUBLIC_APP_URL,
      backPath: `/c/tickets/${ticketId}`,
      expiresAt: new Date(Date.now() + 48 * 3600_000),
    },
    token,
  );
  if (!order) return back("error");
  // Se guarda el id de la Order para consultarla y conciliarla (la referencia externa ya es el id interno del pago).
  await admin.from("payments").update({ external_id: order.id }).eq("id", row.payment_id).eq("provider", "mercadopago");
  redirect(order.checkoutUrl);
}
