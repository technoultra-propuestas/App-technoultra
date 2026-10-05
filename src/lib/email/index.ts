import "server-only";
import { serverEnv } from "@/lib/env.server";
import { renderNotificationEmail, type NotificationEmail } from "./templates";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Evita envíos duplicados ante reintentos (p. ej. un id de notificación). */
  idempotencyKey?: string;
};

export type SendResult =
  | { sent: true; id: string }
  | { sent: false; reason: "not_configured" | "invalid_recipient" | "provider_error" };

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/** Proveedor Resend vía HTTPS. La clave vive solo en el servidor. Sin configuración no falla: devuelve not_configured. */
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  if (!EMAIL_RE.test(msg.to) || msg.to.length > 254 || /[\r\n]/.test(msg.subject))
    return { sent: false, reason: "invalid_recipient" };
  let env: { RESEND_API_KEY: string; EMAIL_FROM: string };
  try {
    env = serverEnv.email();
  } catch {
    return { sent: false, reason: "not_configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(msg.idempotencyKey ? { "Idempotency-Key": msg.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("email.send", res.status);
      return { sent: false, reason: "provider_error" };
    }
    const json = (await res.json()) as { id?: string };
    return { sent: true, id: json.id ?? "" };
  } catch {
    return { sent: false, reason: "provider_error" };
  }
}

export async function sendNotificationEmail(to: string, n: NotificationEmail, idempotencyKey?: string) {
  const { subject, html, text } = renderNotificationEmail(n);
  return sendEmail({ to, subject, html, text, idempotencyKey });
}
