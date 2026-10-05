import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env.public";
import { safeNext } from "@/lib/auth/routes";
import { allow, clientIp } from "@/lib/auth/rate-limit";
import { NEXT_COOKIE } from "@/lib/auth/routes";

/**
 * Inicia "Continuar con Google" mediante Supabase Auth (signInWithOAuth, PKCE).
 * redirectTo se construye con NEXT_PUBLIC_APP_URL (producción: https://app.technoultra.com, desarrollo: http://localhost:3000)
 * y el destino posterior (`next`) solo puede ser una ruta interna.
 */
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
      redirectTo: `${appUrl}/auth/callback`, // exacto: debe coincidir con la lista de Redirect URLs de Supabase (sin query)
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error("auth.google.start", error?.status, error?.code);
    return NextResponse.redirect(new URL("/login?error=oauth", appUrl));
  }
  const res = NextResponse.redirect(data.url);
  // El destino posterior viaja en una cookie corta (no en la URL) para que redirectTo sea exactamente /auth/callback.
  res.cookies.set(NEXT_COOKIE, next, { httpOnly: true, sameSite: "lax", secure: appUrl.startsWith("https://"), path: "/auth", maxAge: 600 });
  return res;
}
