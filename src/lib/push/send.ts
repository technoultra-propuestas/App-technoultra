import "server-only";
import webpush from "web-push";
import { serverEnv } from "@/lib/env.server";
import { notificationHref } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";

type Claimed = {
  notification_id: string;
  recipient_id: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  priority: string;
  attempt: number;
};

/** Cuerpo genérico: el push puede verse en una pantalla bloqueada, así que NUNCA lleva montos, direcciones ni datos del servicio. */
const GENERIC_BODY = "Abre TechnoUltra para ver los detalles.";
/** Textos fijos por tipo de aviso (sin datos personales): dicen qué hacer sin exponer nada en una pantalla bloqueada. */
const SAFE_BODY: Record<string, string> = {
  "document.sign_pending": "Revisa y firma el acta de tu equipo.",
  "document.signed_staff": "El cliente firmó el acta. Toca para ver el ticket.",
  "document.signed": "Guardamos tu firma. Toca para ver el documento.",
  "ticket.exception": "Se autorizó una excepción en un ticket. Toca para verlo.",
};

const MAX_ROUNDS = 8;

export function pushConfigured(): boolean {
  return serverEnv.push() !== null;
}

/**
 * Envía por Web Push los avisos pendientes de quienes activaron push y tienen un dispositivo suscrito. El reclamo (SKIP LOCKED) y el
 * registro de cada intento viven en base de datos: ejecuciones concurrentes no duplican y un fallo no se oculta (`notification_deliveries`).
 * Una suscripción que el navegador ya no reconoce (404/410) se elimina; la lista de dispositivos se limpia sola.
 */
export async function flushPushOutbox(
  limit = 25,
): Promise<{ sent: number; failed: number; removed: number; configured: boolean }> {
  const cfg = serverEnv.push();
  if (!cfg) return { sent: 0, failed: 0, removed: 0, configured: false };
  webpush.setVapidDetails(cfg.VAPID_SUBJECT, cfg.VAPID_PUBLIC_KEY, cfg.VAPID_PRIVATE_KEY);
  const admin = createAdminClient();
  let sent = 0;
  let failed = 0;
  let removed = 0;
  // El reclamo entrega los avisos más antiguos primero: si hay un acumulado (p. ej. de antes de activar el push) el aviso nuevo quedaría al final.
  // Por eso se vacía la cola por lotes (hasta MAX_ROUNDS); el reclamo en base de datos evita duplicados entre ejecuciones concurrentes.
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await admin.rpc("claim_push_notifications", { p_limit: limit });
    if (error || !data) break;
    const claimed = data as Claimed[];
    if (claimed.length === 0) break;
    const { data: kinds } = await admin
      .from("notifications")
      .select("id, type")
      .in(
        "id",
        claimed.map((c) => c.notification_id),
      );
    const typeOf = new Map((kinds ?? []).map((k) => [k.id, k.type]));
    for (const n of claimed) {
      const [{ data: subs }, { data: prof }] = await Promise.all([
        admin
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth_key")
          .eq("profile_id", n.recipient_id),
        admin.from("profiles").select("role").eq("id", n.recipient_id).maybeSingle(),
      ]);
      const role = (prof?.role ?? "client") as "client" | "technician" | "superadmin";
      const url = notificationHref(role, n.entity_type, n.entity_id) ?? (role === "client" ? "/c" : "/b");
      const payload = JSON.stringify({
        title: n.title,
        body: SAFE_BODY[typeOf.get(n.notification_id) ?? ""] ?? GENERIC_BODY,
        url,
        tag: n.notification_id,
        urgent: n.priority === "high",
      });
      let ok = 0;
      let lastError = "";
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
            payload,
            { TTL: 6 * 3600, urgency: n.priority === "high" ? "high" : "normal" },
          );
          ok++;
          await admin
            .from("push_subscriptions")
            .update({ last_success_at: new Date().toISOString(), failed_count: 0 })
            .eq("id", s.id);
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          lastError = `push_${status ?? "error"}`;
          if (status === 404 || status === 410) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
            removed++;
          }
        }
      }
      if (ok > 0) {
        sent++;
        await admin.rpc("record_delivery", {
          p_notification: n.notification_id,
          p_channel: "push",
          p_status: "sent",
        });
      } else {
        failed++;
        await admin.rpc("record_delivery", {
          p_notification: n.notification_id,
          p_channel: "push",
          p_status: "failed",
          p_error: lastError || "sin_dispositivos",
        });
      }
    }
    if (claimed.length < limit) break;
  }
  if (failed) console.error("push.outbox.failed", failed);
  return { sent, failed, removed, configured: true };
}
