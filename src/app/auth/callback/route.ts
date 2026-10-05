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
 *  - El personal NO puede entrar por este camino (Google/enlace): se cierra la sesión y debe usar correo y contraseña.
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
    // Enlace de correo vencido o ya usado: Supabase lo informa con error_code (otp_expired). Cancelar el consentimiento de Google es access_denied.
    if (sp.get("error_code") === "otp_expired") return to("/login?error=link");
    return to(`/login?error=${sp.get("error") === "access_denied" ? "cancelled" : "oauth"}`);
  }
  const code = sp.get("code");
  if (!code || code.length > 2048) return to("/login?error=oauth");
  const next = safeNext(request.cookies.get(NEXT_COOKIE)?.value ?? sp.get("next"), "/");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("auth.callback.exchange", error.status, error.code);
    // Con cookie de destino venimos de Google; sin ella, del enlace del correo (vencido, ya usado o abierto en otro dispositivo).
    return to(request.cookies.has(NEXT_COOKIE) ? "/login?error=oauth" : "/login?error=link");
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return to("/login?error=oauth");
  const { data: profile, error: pErr } = await supabase.from("profiles").select("id, is_active, role").eq("id", auth.user.id).maybeSingle();
  if (pErr || !profile) {
    console.error("auth.callback.profile", pErr?.code ?? "missing");
    await supabase.auth.signOut();
    return to("/login?error=profile");
  }
  // Zero Trust: el personal (admin/técnico) NO entra por Google ni por este callback salvo para recuperar/establecer contraseña
  // (cookie de destino /gestion/... y sesión creada por un enlace de correo). Esa sesión es aal1: sin privilegios hasta verificar el
  // autenticador (la BD no concede rol al personal sin aal2) y GoTrue exige aal2 para cambiar la contraseña si ya hay MFA.
  if (profile.role !== "client") {
    const cookieNext = request.cookies.get(NEXT_COOKIE)?.value;
    const { data: c } = await supabase.auth.getClaims();
    const methods = ((c?.claims as { amr?: { method?: string }[] } | undefined)?.amr ?? []).map((a) => String(a.method));
    const emailLink = !methods.includes("oauth") && !methods.includes("password");
    if (cookieNext === "/gestion/restablecer" && emailLink && profile.is_active) return to("/gestion/restablecer");
    await supabase.auth.signOut();
    return to("/login?error=staff");
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    return to("/login?error=inactive");
  }
  // La cookie de recuperación del personal no aplica a clientes.
  return to(next.startsWith("/gestion") ? "/" : next);
}
