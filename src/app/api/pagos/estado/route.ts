import { NextResponse } from "next/server";
import { z } from "zod";
import { allow } from "@/lib/auth/rate-limit";
import { getPublicEnv } from "@/lib/env.public";
import { scheduleEmailFlush } from "@/lib/email/outbox";
import { refreshPaymentStatus } from "@/lib/payments/refresh";
import { derivePaymentUi, type DbPaymentStatus } from "@/lib/payments/state";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const body = z.object({ ticketId: z.string().uuid() });
const no = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * «Consultar estado de pago»: el cliente pide al SERVIDOR que compruebe con el proveedor el pago en curso de SU ticket.
 * Seguridad: misma procedencia (Origin), sesión verificada, el pago se localiza con la sesión del usuario (RLS: solo los suyos) y el
 * estado devuelto sale de la base de datos tras verificar. El navegador no aporta ningún estado ni importe.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).origin) return no(403, "origin");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return no(401, "unauthenticated");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return no(400, "invalid");
  // Margen para sondeos legítimos (cada 5 s) pero no para abuso.
  if (!(await allow("pay-refresh", auth.user.id, 40, 60))) return no(429, "rate_limited");

  // RLS: solo devuelve pagos de tickets del propio cliente. Uno ajeno aparece como inexistente (sin filtrar su existencia).
  const { data: rows } = await supabase.from("payments").select("id, status, provider, created_at, purpose, installment").eq("ticket_id", parsed.data.ticketId).order("created_at", { ascending: false });
  const list = rows ?? [];
  if (!list.length) return NextResponse.json({ ok: true, state: "none", verified: true, changed: false }, { headers: { "Cache-Control": "no-store" } });

  const pending = list.find((p) => p.status === "pending" && p.provider === "mercadopago");
  let verified = true;
  let changed = false;
  if (pending) {
    // Tope por pago para no martillar al proveedor aunque se abran varias pestañas.
    if (await allow("pay-refresh-mp", pending.id, 8, 30)) {
      const r = await refreshPaymentStatus(pending.id);
      if (r) {
        verified = r.verified;
        changed = r.changed;
      }
      if (changed) scheduleEmailFlush();
    }
  }
  // Estado definitivo = lo persistido ahora (nunca lo que dijo el navegador ni lo que respondió el proveedor sin aplicar).
  const { data: fresh } = await supabase.from("payments").select("status, provider, created_at, purpose, installment").eq("ticket_id", parsed.data.ticketId);
  // El estado se calcula para el MISMO concepto (diagnóstico, servicio o cotización) y, en cotizaciones, para la MISMA modalidad
  // (un anticipo confirmado no debe hacer creer que el saldo en validación ya se resolvió).
  const target = pending ?? list[0];
  const ui = derivePaymentUi((fresh ?? []).filter((p) => p.purpose === target.purpose && (p.purpose !== "quote" || (p.installment ?? null) === (target.installment ?? null))).map((p) => ({ status: p.status as DbPaymentStatus, provider: p.provider, created_at: p.created_at })), false);
  return NextResponse.json({ ok: true, state: ui.state, verified, changed }, { headers: { "Cache-Control": "no-store" } });
}
