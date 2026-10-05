// EMERGENCIA: elimina los factores MFA (TOTP) de una persona del equipo cuando perdió su teléfono y no hay otro administrador que
// pueda hacerlo desde /b/usuarios. Uso (desde la carpeta del proyecto, con las variables de .env.local):
//   node --env-file=.env.local scripts/reset-staff-mfa.mjs correo@dominio.com
// Solo borra factores en Supabase Auth (no toca contraseñas). En su próximo ingreso la persona configura un autenticador nuevo.
// No imprime secretos. Queda registrado en la auditoría (admin.security_changed) si existe otro administrador activo como actor.
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !key) {
  console.error("Falta el correo o las variables NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: target } = await sb.from("profiles").select("id, role").eq("email", email).maybeSingle();
if (!target || target.role === "client") {
  console.error("No existe una cuenta de personal con ese correo.");
  process.exit(1);
}
const { data: factors, error } = await sb.auth.admin.mfa.listFactors({ userId: target.id });
if (error) {
  console.error("No se pudieron leer los factores:", error.message);
  process.exit(1);
}
for (const f of factors?.factors ?? []) await sb.auth.admin.mfa.deleteFactor({ id: f.id, userId: target.id });
const { data: actor } = await sb.from("profiles").select("id").eq("role", "admin").eq("is_active", true).limit(1).maybeSingle();
if (actor) await sb.rpc("log_admin_event", { p_actor: actor.id, p_event: "admin.security_changed", p_target: target.id, p_metadata: { scope: "mfa_reset", method: "cli" } });
console.log(`Listo: ${(factors?.factors ?? []).length} factor(es) eliminados para ${email}. Deberá configurar su autenticador al iniciar sesión.`);
