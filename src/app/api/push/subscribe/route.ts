import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicEnv } from "@/lib/env.public";
import { setPreference } from "@/lib/notification-prefs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const subscription = z.object({
  endpoint: z.string().url().max(1000).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** Misma procedencia: la petición debe venir de nuestra propia página (protección CSRF de una ruta con cookies de sesión). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).origin;
}

/** Sesión verificada en el servidor; el dueño del dispositivo SIEMPRE es el usuario de la sesión, nunca un dato del cuerpo. */
async function sessionUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, supabase } : null;
}

/** Registra este dispositivo y activa el push del usuario. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const user = await sessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = subscription.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    { profile_id: user.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth_key: parsed.data.keys.auth, user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200) },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await setPreference(user.supabase, user.id, { push_enabled: true }))) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Quita este dispositivo (y desactiva el push si no queda ninguno). Solo los dispositivos del propio usuario. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const user = await sessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = z.object({ endpoint: z.string().url().max(1000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const admin = createAdminClient();
  await admin.from("push_subscriptions").delete().eq("profile_id", user.id).eq("endpoint", parsed.data.endpoint);
  const { count } = await admin.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("profile_id", user.id);
  if (!count) await setPreference(user.supabase, user.id, { push_enabled: false });
  return NextResponse.json({ ok: true });
}
