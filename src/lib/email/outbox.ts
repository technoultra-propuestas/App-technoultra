import "server-only";
import { after } from "next/server";
import { getPublicEnv } from "@/lib/env.public";
import { notificationHref } from "@/lib/notifications";
import { flushPushOutbox } from "@/lib/push/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotificationEmail } from "./index";

type Claimed = { id: string; to_email: string; full_name: string; title: string; body: string | null; type: string; entity_type: string | null; entity_id: string | null; recipient_role: string };

/**
 * Envía los avisos importantes pendientes por correo (Resend). Cada aviso se "reclama" en base de datos antes de enviarse:
 * ejecuciones concurrentes no duplican correos. Si Resend no está configurado, no se envía nada (y no se pierden los datos:
 * los avisos siguen visibles dentro de la app).
 */
export async function flushEmailOutbox(limit = 25): Promise<{ sent: number; failed: number; skipped: number }> {
  const admin = createAdminClient();
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;
  const { data, error } = await admin.rpc("claim_email_notifications", { p_limit: limit });
  if (error || !data) return { sent: 0, failed: 0, skipped: 0 };
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const n of data as Claimed[]) {
    const role = n.recipient_role === "technician" || n.recipient_role === "superadmin" ? n.recipient_role : "client";
    const href = notificationHref(role, n.entity_type, n.entity_id);
    const r = await sendNotificationEmail(
      n.to_email,
      { title: n.title, body: n.body ?? `Hola ${n.full_name.split(" ")[0] || ""}, tienes una novedad en TechnoUltra.`.replace("Hola ,", "Hola,"), ctaLabel: href ? "Ver en TechnoUltra" : undefined, ctaUrl: href ? `${appUrl}${href}` : undefined },
      `notif-${n.id}`,
    );
    if (r.sent) sent++;
    else if (r.reason === "not_configured") skipped++;
    else failed++;
    // Registro del envío (separado del aviso): enviado / omitido (sin proveedor) / fallido.
    await admin.rpc("record_delivery", { p_notification: n.id, p_channel: "email", p_status: r.sent ? "sent" : r.reason === "not_configured" ? "skipped" : "failed", p_error: r.sent ? undefined : String(r.reason ?? "error") });
  }
  if (failed) console.error("email.outbox.failed", failed);
  return { sent, failed, skipped };
}

/** Programa el envío (correo y push) DESPUÉS de responder al usuario (no bloquea la acción). */
export function scheduleEmailFlush(limit = 10) {
  try {
    after(async () => {
      await Promise.allSettled([flushEmailOutbox(limit), flushPushOutbox(limit)]);
    });
  } catch {
    /* fuera de un contexto de petición (pruebas): se ignora */
  }
}
