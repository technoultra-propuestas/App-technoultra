import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/health";

/** Estado mínimo para monitores externos (UptimeRobot, etc.): sin detalles ni datos; 503 si la base no responde. */
export async function GET() {
  const ok = await checkDatabase();
  return NextResponse.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
