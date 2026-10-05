import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env.public";
import { safeNext } from "@/lib/auth/routes";

const ALLOWED: EmailOtpType[] = ["invite", "recovery", "email"];

/** Confirmación por enlace con token_hash (invitaciones de personal). El tipo se valida contra una lista cerrada. */
export async function GET(request: NextRequest) {
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(request.nextUrl.searchParams.get("next"), "/");
  if (!tokenHash || !type || !ALLOWED.includes(type))
    return NextResponse.redirect(new URL("/login?error=link", appUrl));
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return NextResponse.redirect(new URL("/login?error=link", appUrl));
  return NextResponse.redirect(new URL(next, appUrl));
}
