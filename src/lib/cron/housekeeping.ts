import "server-only";
import { flushEmailOutbox } from "@/lib/email/outbox";
import { flushPushOutbox } from "@/lib/push/send";
import { reconcilePendingPayments } from "@/lib/payments/reconcile";
import { checkDatabase } from "@/lib/health";
import { createAdminClient } from "@/lib/supabase/admin";

export type HousekeepingResult = { ok: true; result: unknown; expiredPayments: number; payments: unknown; emails: unknown; push: unknown } | { ok: false };

/**
 * Tareas periódicas (idempotentes, se pueden ejecutar varias veces al día sin efectos duplicados): mantenimiento de la base, vencimiento
 * de pagos en línea sin completar (48 h), conciliación de pagos pendientes con el proveedor (si hay credenciales) y envío de correos en cola.
 * La llama el cron autorizado (ruta `housekeeping` o, en el plan Hobby de Vercel que limita a 2 tareas programadas, la de `catalog-sync`).
 */
export async function runHousekeeping(): Promise<HousekeepingResult> {
  await checkDatabase(); // latido de solo lectura: mantiene activo Supabase y avisa a Sentry si la base no responde
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("run_housekeeping");
  if (error) {
    console.error("cron.housekeeping", error.code);
    return { ok: false };
  }
  await admin.rpc("skip_non_email_notifications");
  const { data: expired } = await admin.rpc("expire_pending_service_payments");
  const payments = await reconcilePendingPayments(20);
  // Avisos de tickets sin atender (una vez por día y ticket) antes de vaciar las colas de envío.
  await admin.rpc("notify_stale_tickets");
  await admin.rpc("notify_stale_payments");
  const emails = await flushEmailOutbox(50);
  const push = await flushPushOutbox(50);
  return { ok: true, result: data, expiredPayments: Number(expired ?? 0), payments, emails, push };
}
