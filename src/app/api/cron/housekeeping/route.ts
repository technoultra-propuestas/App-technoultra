import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { flushEmailOutbox } from "@/lib/email/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

const reply = (status: number, body: Record<string, unknown> = {}) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Tareas periódicas (Vercel Cron envía `Authorization: Bearer <CRON_SECRET>`). Sin el secreto configurado la ruta queda
 * cerrada (503): nunca se ejecuta de forma pública.
 */
export async function GET(request: NextRequest) {
  const secret = z.string().min(16).safeParse(process.env.CRON_SECRET);
  if (!secret.success) return reply(503, { error: "not_configured" });
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ") || !safeEqual(header.slice(7), secret.data)) return reply(401, { error: "unauthorized" });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("run_housekeeping");
  if (error) {
    console.error("cron.housekeeping", error.code);
    return reply(500, { error: "failed" });
  }
  await admin.rpc("skip_non_email_notifications");
  const emails = await flushEmailOutbox(50);
  return reply(200, { ok: true, result: data, emails });
}
