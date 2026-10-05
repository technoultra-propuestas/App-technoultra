import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env.public";
import { safeNext } from "@/lib/auth/routes";
import { allow, clientIp } from "@/lib/auth/rate-limit";

/** Inicia OAuth con Google (PKCE; el estado y el verificador viajan en cookies httpOnly gestionadas por Supabase). */
export async function GET(request: NextRequest) {
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;
  if (!(await allow("oauth-ip", await clientIp(), 30, 600))) {
    return NextResponse.redirect(new URL("/login?error=rate", appUrl));
  }
  const next = safeNext(request.nextUrl.searchParams.get("next"), "/");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) return NextResponse.redirect(new URL("/login?error=oauth", appUrl));
  return NextResponse.redirect(data.url);
}
