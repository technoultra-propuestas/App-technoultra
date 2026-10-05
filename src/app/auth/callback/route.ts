import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env.public";
import { NEXT_COOKIE, safeNext } from "@/lib/auth/routes";

/**
 * Callback de OAuth (Supabase → aplicación). Flujo PKCE: el verificador viaja en una cookie httpOnly puesta al iniciar el
 * login; aquí el código de un solo uso se canjea por una sesión (cookies seguras vía @supabase/ssr).
 *
 *  - `next` pasa por safeNext (solo rutas internas): sin open redirect.
 *  - Cancelación o error del proveedor → /login con aviso; nunca se refleja el texto del error recibido.
 *  - Una sesión sin perfil activo se cierra de inmediato (el rol sale SIEMPRE de la base de datos, nunca de Google).
 */
export async function GET(request: NextRequest) {
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;
  const to = (path: string) => {
    const res = NextResponse.redirect(new URL(path, appUrl));
    res.cookies.delete({ name: NEXT_COOKIE, path: "/auth" });
    return res;
  };
  const sp = request.nextUrl.searchParams;

  if (sp.get("error")) {
    // Código canónico de OAuth cuando la persona cancela el consentimiento.
    return to(`/login?error=${sp.get("error") === "access_denied" ? "cancelled" : "oauth"}`);
  }
  const code = sp.get("code");
  if (!code || code.length > 2048) return to("/login?error=oauth");
  const next = safeNext(request.cookies.get(NEXT_COOKIE)?.value ?? sp.get("next"), "/");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("auth.callback.exchange", error.status, error.code);
    return to("/login?error=oauth"); // código inválido, vencido o ya usado
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return to("/login?error=oauth");
  const { data: profile, error: pErr } = await supabase.from("profiles").select("id, is_active").eq("id", auth.user.id).maybeSingle();
  if (pErr || !profile) {
    console.error("auth.callback.profile", pErr?.code ?? "missing");
    await supabase.auth.signOut();
    return to("/login?error=profile");
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    return to("/login?error=inactive");
  }
  return to(next);
}
