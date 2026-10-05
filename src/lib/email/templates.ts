export type NotificationEmail = {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

export const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Solo se enlazan URLs https (o http en localhost) para evitar esquemas peligrosos como javascript:. */
export function safeUrl(u?: string): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost"))
      return url.toString();
  } catch {
    /* ignorar */
  }
  return null;
}

/** Plantilla transaccional con la identidad aprobada (fondo claro, acento naranja, Manrope con respaldo). */
export function renderNotificationEmail(n: NotificationEmail) {
  const title = escapeHtml(n.title);
  const body = escapeHtml(n.body).replace(/\n/g, "<br>");
  const url = safeUrl(n.ctaUrl);
  const cta =
    url && n.ctaLabel
      ? `<p style="margin:24px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#FF8A00;color:#121212;font-weight:800;text-decoration:none;padding:14px 22px;border-radius:14px">${escapeHtml(n.ctaLabel)}</a></p>`
      : "";
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F6F6F5;font-family:Manrope,Arial,sans-serif;color:#121212"><table role="presentation" width="100%" style="padding:24px 12px"><tr><td align="center"><table role="presentation" width="480" style="max-width:480px;background:#FFFFFF;border:1px solid #ECECE9;border-radius:20px;padding:28px"><tr><td><div style="font-weight:800;font-size:20px">TECHN<span style="color:#FF8A00">⏻</span>ULTRA</div><h1 style="font-size:22px;margin:20px 0 8px">${title}</h1><p style="font-size:15px;line-height:1.55;color:#3A3A38;margin:0">${body}</p>${cta}</td></tr></table></td></tr></table></body></html>`;
  const text = `${n.title}\n\n${n.body}${url && n.ctaLabel ? `\n\n${n.ctaLabel}: ${url}` : ""}\n\nTechnoUltra`;
  return { subject: n.title.slice(0, 150).replace(/[\r\n]+/g, " "), html, text };
}
