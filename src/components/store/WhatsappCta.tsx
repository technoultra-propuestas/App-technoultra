"use client";

import { haptic } from "@/lib/haptics";

/**
 * Botón de compra por WhatsApp. El enlace funciona sin JavaScript; al pulsar se registra (sin datos personales) qué producto genera consultas.
 * El registro nunca bloquea ni retrasa la apertura de WhatsApp.
 */
export function WhatsappCta({ productId, href, label = "Consultar y comprar por WhatsApp", compact = false }: { productId: string; href: string; label?: string; compact?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        haptic("tap");
        try {
          void fetch("/api/tienda/consulta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }), keepalive: true });
        } catch {
          /* sin registro: la consulta sigue */
        }
      }}
      className={`press inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-brand px-5 text-center font-extrabold text-ink no-underline shadow-card ${compact ? "min-h-11 text-[14px]" : "min-h-[52px] text-[16px]"}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14.2c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1a14 14 0 0 1-4.9-3 8.2 8.2 0 0 1-1.7-2.5c-.5-1.2 0-2 .4-2.4.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.6l-.4.5c-.2.2-.3.3-.1.6.4.7 1 1.3 1.7 1.8.6.5 1.4.8 1.7.9.3.1.4 0 .6-.2l.7-.9c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.2.5.3.1.2.1.8-.1 1.3Z" />
      </svg>
      {label}
    </a>
  );
}
