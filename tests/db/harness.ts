import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Emula lo mínimo de Supabase (roles, esquema auth, auth.uid(), privilegios por defecto) y aplica las
 * migraciones REALES de supabase/migrations en Postgres 17 (PGlite). Sirve para probar RLS y flujos sin Docker.
 */
export async function createDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    create schema extensions;
    create schema auth;
    grant usage on schema auth, extensions, public to anon, authenticated, service_role;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      email_confirmed_at timestamptz
    );
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    grant execute on function auth.jwt() to anon, authenticated, service_role;
    -- privilegios por defecto idénticos a un proyecto Supabase nuevo
    alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
  `);
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  for (const f of readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    try {
      await db.exec(readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`Migración ${f} falló: ${(e as Error).message}`);
    }
  }
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;

let seq = 0;
export const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

/** Ejecuta como el rol de PostgREST: role authenticated/anon + claims JWT. */
/** aal: nivel de aseguramiento de la sesión (aal2 = MFA verificado). Por defecto aal2 para no alterar pruebas existentes. */
export async function as<T>(db: Db, userId: string | null, fn: () => Promise<T>, opts: { aal?: "aal1" | "aal2" } = {}): Promise<T> {
  const role = userId ? "authenticated" : "anon";
  await db.exec(`set role ${role}`);
  if (userId) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${userId}', false)`);
    await db.exec(
      `select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated","aal":"${opts.aal ?? "aal2"}"}', false)`,
    );
  }
  try {
    return await fn();
  } finally {
    await db.exec(
      `reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claims', '', false)`,
    );
  }
}

export async function createUser(db: Db, email: string, meta: Record<string, unknown> = {}) {
  const id = uid();
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`, [
    id,
    email,
    JSON.stringify(meta),
  ]);
  return id;
}

/** Bootstrap del primer administrador: solo posible como propietario de la base de datos (no desde la API). */
export async function makeAdmin(db: Db, id: string) {
  await db.query(`update public.profiles set role = 'admin' where id = $1`, [id]);
}
export async function makeTechnician(db: Db, adminId: string, id: string) {
  await db.query(`select public.admin_provision_staff($1, $2, 'technician', 'Técnico', null, 'Técnico')`, [
    adminId,
    id,
  ]);
}
