import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env.public";
import { safeNext } from "@/lib/auth/routes";

/** Intercambia el código OAuth/PKCE por una sesión. El destino se valida (sin open redirect). */
export async function GET(request: NextRequest) {
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"), "/");
  if (!code) return NextResponse.redirect(new URL("/login?error=oauth", appUrl));
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth", appUrl));
  return NextResponse.redirect(new URL(next, appUrl));
}
