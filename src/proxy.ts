import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/security/csp";
import { isAuthPage, isProtectedPath, safeNext } from "@/lib/auth/routes";

/**
 * Proxy (antes "middleware" en Next 14): refresca la sesión, aplica CSP con nonce y hace el control GRUESO de acceso.
 * La autorización real (rol, propiedad, estado) se vuelve a comprobar en cada layout/Server Action y en RLS.
 */
export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
  const csp = buildCsp(nonce, { isDev: process.env.NODE_ENV === "development", supabaseUrl });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims valida la firma del JWT (y refresca si expiró) sin una ida y vuelta al servidor en cada navegación.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
    const redirect = NextResponse.redirect(url);
    // conserva cookies de sesión refrescadas
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  };

  if (!signedIn && isProtectedPath(pathname))
    return redirectTo("/login", { next: safeNext(pathname + search, "/") });
  if (signedIn && isAuthPage(pathname) && pathname !== "/verificar") return redirectTo("/");

  response.headers.set("Content-Security-Policy", csp);
  if (isProtectedPath(pathname) || isAuthPage(pathname))
    response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
