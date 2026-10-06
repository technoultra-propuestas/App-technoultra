// Datos de prueba para la pila LOCAL de Supabase. Se niega a ejecutarse contra cualquier otra base (nunca producción).
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { e2eEnv } from "./support.mjs";

const DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? "supabase_db_App-tecnhoultra";

export function assertLocal(env = e2eEnv()) {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
    throw new Error("E2E: NEXT_PUBLIC_SUPABASE_URL no es local. Estas pruebas crean datos inmutables y solo corren contra `supabase start`.");
  }
}

/** Ejecuta SQL en la base local (contenedor Docker de `supabase start`). Devuelve la salida en texto plano. */
export function psql(sql) {
  return execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA"], { input: sql, encoding: "utf8" }).trim();
}

export function adminClient(env = e2eEnv()) {
  assertLocal(env);
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** Crea un usuario con correo ya confirmado (el trigger de la BD crea su perfil de cliente). */
export async function createUser(sb, { email, password, fullName }) {
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

/** Deja la base lista para la jerarquía: un SUPERADMIN (propietario único) y un técnico. Devuelve sus ids. */
export async function seedStaff(sb, { owner, tech }) {
  const ownerId = await createUser(sb, owner);
  const { error: e1 } = await sb.rpc("bootstrap_first_superadmin", { p_user_id: ownerId });
  if (e1) throw new Error(`bootstrap_first_superadmin: ${e1.message}`);
  const techId = await createUser(sb, tech);
  const { error: e2 } = await sb.rpc("admin_provision_staff", { p_actor: ownerId, p_user_id: techId, p_role: "technician", p_full_name: tech.fullName, p_title: "Técnico de pruebas" });
  if (e2) throw new Error(`admin_provision_staff: ${e2.message}`);
  return { ownerId, techId };
}

/**
 * Publica textos legales de PRUEBA (solo en la base local) para que el onboarding pueda registrar aceptaciones.
 * Usa la función real `publish_legal_document` con la identidad del SUPERADMIN (aal2), como lo haría el CRM.
 */
export function publishLegalFixtures(ownerId, slugs = ["terms", "data_policy", "data_authorization"]) {
  const sql = slugs
    .map(
      (s) => `insert into public.legal_documents (slug, version, title, content, status, requires_acceptance)
        select '${s}', coalesce((select max(version) from public.legal_documents where slug = '${s}'), 0) + 1, 'Documento de prueba ${s}', E'## 1. Prueba\\n\\nTexto de prueba E2E (solo entorno local).', 'draft', true
        where not exists (select 1 from public.legal_documents where slug = '${s}' and status = 'published');`,
    )
    .join("\n");
  psql(`begin;
${sql}
select set_config('request.jwt.claims', json_build_object('sub', '${ownerId}', 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
select public.publish_legal_document(id) from public.legal_documents where status = 'draft' and title like 'Documento de prueba%';
commit;`);
}
