import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { excelenterCsvUrlProvider } from "@/lib/catalog/provider";
import { runCatalogSync, type RpcClient } from "@/lib/catalog/sync";
import { createAdminClient } from "@/lib/supabase/admin";

const reply = (status: number, body: Record<string, unknown> = {}) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Sincronización automática del catálogo de proveedor. Vercel Cron envía `Authorization: Bearer <CRON_SECRET>`; sin el secreto la ruta
 * queda cerrada (503). Si la fuente no está configurada no se registra ruido: simplemente no hay nada que sincronizar.
 */
export async function GET(request: NextRequest) {
  const secret = z.string().min(16).safeParse(process.env.CRON_SECRET);
  if (!secret.success) return reply(503, { error: "not_configured" });
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ") || !safeEqual(header.slice(7), secret.data)) return reply(401, { error: "unauthorized" });
  const outcome = await runCatalogSync(createAdminClient() as unknown as RpcClient, excelenterCsvUrlProvider(), "automatic");
  if (outcome.ok) revalidateTag("catalog", { expire: 0 });
  if (!outcome.ok && outcome.reason === "not_configured") return reply(200, { ok: true, skipped: "source_not_configured" });
  return reply(outcome.ok ? 200 : 502, { ok: outcome.ok, status: outcome.status, ...(outcome.ok ? { summary: outcome.summary } : { reason: outcome.reason }) });
}
