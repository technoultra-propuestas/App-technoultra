// Bootstrap SEGURO del SUPERADMIN (propietario único de TechnoUltra). Uso:
//   node --env-file=.env.local scripts/bootstrap-admin.mjs correo@dominio.com
// Requisitos: la persona ya se registró y verificó su correo en la app. Solo funciona UNA vez
// (la función de base de datos falla si ya existe un SUPERADMIN). No imprime secretos.
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !key) {
  console.error("Falta el correo o las variables NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: profile, error: e1 } = await sb
  .from("profiles")
  .select("id, role")
  .eq("email", email)
  .maybeSingle();
if (e1 || !profile) {
  console.error(
    "No existe un usuario registrado con ese correo. Primero debe crear su cuenta y verificar el correo.",
  );
  process.exit(1);
}
const { error } = await sb.rpc("bootstrap_first_superadmin", { p_user_id: profile.id });
if (error) {
  console.error(
    error.message.includes("superadmin_already_exists")
      ? "Ya existe un SUPERADMIN (propietario único)."
      : `Error: ${error.code ?? "desconocido"}`,
  );
  process.exit(1);
}
console.log(`Listo: ${email} ahora es SUPERADMIN.`);
