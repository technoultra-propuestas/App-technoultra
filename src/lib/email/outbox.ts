import "server-only";
import { after } from "next/server";
import { getPublicEnv } from "@/lib/env.public";
import { notificationHref } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotificationEmail } from "./index";

type Claimed = { id: string; to_email: string; full_name: string; title: string; body: string | null; type: string; entity_type: string | null; entity_id: string | null };

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
    const href = notificationHref("client", n.entity_type, n.entity_id);
    const r = await sendNotificationEmail(
      n.to_email,
      { title: n.title, body: n.body ?? `Hola ${n.full_name.split(" ")[0] || ""}, tienes una novedad en TechnoUltra.`.replace("Hola ,", "Hola,"), ctaLabel: href ? "Ver en TechnoUltra" : undefined, ctaUrl: href ? `${appUrl}${href}` : undefined },
      `notif-${n.id}`,
    );
    if (r.sent) sent++;
    else if (r.reason === "not_configured") skipped++;
    else failed++;
  }
  if (failed) console.error("email.outbox.failed", failed);
  return { sent, failed, skipped };
}

/** Programa el envío DESPUÉS de responder al usuario (no bloquea la acción). */
export function scheduleEmailFlush(limit = 10) {
  try {
    after(async () => {
      await flushEmailOutbox(limit);
    });
  } catch {
    /* fuera de un contexto de petición (pruebas): se ignora */
  }
}
