import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";

const done = (status = 204) => new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Registra que alguien pulsó «Consultar por WhatsApp» (solo el producto y la hora: sin IP, sin datos personales).
 * Es público a propósito (no hay sesión), por eso: valida que el producto exista y sea visible (RLS), limita por origen y nunca devuelve detalles.
 */
export async function POST(request: NextRequest) {
  const body = z.object({ productId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return done(400);
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const key = "inq:" + createHash("sha256").update(ip).digest("hex").slice(0, 24); // la IP no se guarda: solo un hash en el contador temporal
  const admin = createAdminClient();
  const { data: ok } = await admin.rpc("check_rate_limit", { p_key: key, p_max: 30, p_window_seconds: 600 });
  if (ok === false) return done(429);
  const { data: visible } = await createPublicClient().from("products").select("id").eq("id", body.data.productId).not("source", "is", null).maybeSingle();
  if (!visible) return done(404);
  await admin.from("product_inquiries").insert({ product_id: visible.id, channel: "whatsapp" });
  return done();
}
