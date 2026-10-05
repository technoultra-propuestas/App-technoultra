import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, type Db } from "./harness";

let db: Db;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|privileged_column|forbidden|42501/i;

beforeAll(async () => {
  db = await createDb();
}, 180000);

describe("limitador de intentos", () => {
  it("permite hasta el máximo y luego bloquea; solo service_role puede invocarlo", async () => {
    const calls = [];
    for (let i = 0; i < 4; i++)
      calls.push((await q<{ ok: boolean }>(`select public.check_rate_limit('login:x', 3, 600) ok`))[0].ok);
    expect(calls).toEqual([true, true, true, false]);
    const u = await createUser(db, "rl@gmail.com");
    await expect(as(db, u, () => q(`select public.check_rate_limit('x', 1, 1)`))).rejects.toThrow(denied);
    await expect(as(db, null, () => q(`select public.check_rate_limit('x', 1, 1)`))).rejects.toThrow(denied);
  });
  it("la ventana se reinicia al vencer", async () => {
    await q(`select public.check_rate_limit('k2', 1, 1)`);
    expect((await q<{ ok: boolean }>(`select public.check_rate_limit('k2', 1, 1) ok`))[0].ok).toBe(false);
    await q(`update private.rate_limits set window_start = now() - interval '5 seconds' where key = 'k2'`);
    expect((await q<{ ok: boolean }>(`select public.check_rate_limit('k2', 1, 1) ok`))[0].ok).toBe(true);
  });
  it("rechaza argumentos inválidos", async () => {
    await expect(q(`select public.check_rate_limit('k', 0, 10)`)).rejects.toThrow(/invalid_rate_limit_args/);
  });
});

describe("bootstrap del primer administrador", () => {
  it("funciona una sola vez y solo para service_role", async () => {
    const a = await createUser(db, "primero@technoultra.com");
    const b = await createUser(db, "segundo@technoultra.com");
    await expect(as(db, a, () => q(`select public.bootstrap_first_admin($1)`, [a]))).rejects.toThrow(denied);
    await q(`select public.bootstrap_first_admin($1)`, [a]);
    expect((await q<{ role: string }>(`select role from profiles where id = $1`, [a]))[0].role).toBe("admin");
    await expect(q(`select public.bootstrap_first_admin($1)`, [b])).rejects.toThrow(/admin_already_exists/);
    expect((await q<{ role: string }>(`select role from profiles where id = $1`, [b]))[0].role).toBe(
      "client",
    );
  });
});

describe("onboarding persistente", () => {
  let cli: string;
  beforeAll(async () => {
    cli = await createUser(db, "nuevo@gmail.com", { full_name: "Nuevo Cliente" });
  });

  it("el paso se guarda en backend y el cliente no puede marcarse como completado", async () => {
    await as(db, cli, () => q(`update profiles set onboarding_step = 2 where id = $1`, [cli]));
    expect((await q<{ s: number }>(`select onboarding_step s from profiles where id = $1`, [cli]))[0].s).toBe(
      2,
    );
    await expect(
      as(db, cli, () => q(`update profiles set onboarding_completed_at = now() where id = $1`, [cli])),
    ).rejects.toThrow(denied);
    await expect(
      as(db, cli, () => q(`update profiles set onboarding_step = 9 where id = $1`, [cli])),
    ).rejects.toThrow(/check/i);
  });

  it("no se completa sin celular ni sin aceptar los documentos publicados", async () => {
    await expect(as(db, cli, () => q(`select public.complete_onboarding()`))).rejects.toThrow(
      /onboarding_incomplete: phone/,
    );
    await as(db, cli, () => q(`update customers set phone = '3001234567' where profile_id = $1`, [cli]));
    const [t] = await q<{ id: string }>(
      `insert into legal_documents (slug, version, title, content, status) values ('terms',1,'Términos','texto','published') returning id`,
    );
    const [p] = await q<{ id: string }>(
      `insert into legal_documents (slug, version, title, content, status) values ('data_policy',1,'Datos','texto','published') returning id`,
    );
    await expect(as(db, cli, () => q(`select public.complete_onboarding()`))).rejects.toThrow(
      /onboarding_incomplete: (terms|data_policy)/,
    );
    const pending = await as(db, cli, () =>
      q<{ slug: string }>(`select slug from public.pending_legal_documents()`),
    );
    expect(pending.map((x) => x.slug).sort()).toEqual(["data_policy", "terms"]);
    await as(db, cli, () => q(`select public.accept_legal_document($1)`, [t.id]));
    await expect(as(db, cli, () => q(`select public.complete_onboarding()`))).rejects.toThrow(/data_policy/);
    await as(db, cli, () => q(`select public.accept_legal_document($1)`, [p.id]));
    await as(db, cli, () => q(`select public.complete_onboarding()`));
    const [row] = await q<{ done: boolean; step: number }>(
      `select onboarding_completed_at is not null done, onboarding_step step from profiles where id = $1`,
      [cli],
    );
    expect(row).toEqual({ done: true, step: 6 });
    expect(await as(db, cli, () => q(`select * from public.pending_legal_documents()`))).toHaveLength(0);
  });

  it("una nueva versión publicada vuelve a exigir aceptación sin tocar el histórico", async () => {
    await q(`update legal_documents set status = 'retired' where slug = 'terms' and version = 1`);
    const [v2] = await q<{ id: string }>(
      `insert into legal_documents (slug, version, title, content, status) values ('terms',2,'Términos v2','nuevo','published') returning id`,
    );
    const pending = await as(db, cli, () =>
      q<{ id: string }>(`select id from public.pending_legal_documents()`),
    );
    expect(pending.map((x) => x.id)).toEqual([v2.id]);
    expect((await q(`select 1 from legal_acceptances where profile_id = $1`, [cli])).length).toBe(2);
  });

  it("el personal no puede completar onboarding de cliente", async () => {
    const [{ id }] = await q<{ id: string }>(`select id from profiles where role = 'admin' limit 1`);
    await expect(as(db, id, () => q(`select public.complete_onboarding()`))).rejects.toThrow(denied);
  });

  it("se puede preparar un administrador de pruebas sin pasar por la API", async () => {
    const x = await createUser(db, "otro@technoultra.com");
    await makeAdmin(db, x);
    expect((await q<{ role: string }>(`select role from profiles where id = $1`, [x]))[0].role).toBe("admin");
  });
});

describe("registro con Google y anti-escalada de rol", () => {
  it("un alta de Google nace SIEMPRE como cliente aunque los metadatos pidan otro rol", async () => {
    const id = await createUser(db, "google.user@gmail.com", {
      provider_id: "1234567890",
      iss: "https://accounts.google.com",
      email_verified: true,
      full_name: "Usuario Google",
      avatar_url: "https://lh3.googleusercontent.com/a/x",
      role: "admin",
      app_role: "admin",
      is_admin: true,
      user_role: "technician",
      invited_role: "admin",
    });
    const [p] = await q<{ role: string; full_name: string; is_active: boolean }>(`select role, full_name, is_active from profiles where id = $1`, [id]);
    expect(p).toEqual({ role: "client", full_name: "Usuario Google", is_active: true });
    expect((await q(`select 1 from staff_members where profile_id = $1`, [id])).length).toBe(0);
    expect((await q(`select 1 from customers where profile_id = $1`, [id])).length).toBe(1);
  });

  it("un inicio de sesión posterior (actualización de metadatos) no cambia el rol ni reactiva cuentas", async () => {
    const id = await createUser(db, "ya.existe@gmail.com", { full_name: "Ya Existe" });
    await q(`update auth.users set raw_user_meta_data = $2::jsonb where id = $1`, [id, JSON.stringify({ role: "admin", full_name: "Otro Nombre" })]);
    expect((await q<{ role: string }>(`select role from profiles where id = $1`, [id]))[0].role).toBe("client");
    await q(`update profiles set is_active = false where id = $1`, [id]);
    await q(`update auth.users set raw_user_meta_data = '{"is_active": true}'::jsonb where id = $1`, [id]);
    expect((await q<{ a: boolean }>(`select is_active a from profiles where id = $1`, [id]))[0].a).toBe(false);
  });

  it("el cliente autenticado con Google no puede ejecutar funciones de administración", async () => {
    const id = await createUser(db, "g2@gmail.com", { iss: "https://accounts.google.com" });
    for (const sql of [
      `select public.admin_provision_staff('${id}', '${id}', 'admin', 'x')`,
      `select public.bootstrap_first_admin('${id}')`,
      `select public.admin_set_user_active('${id}', '${id}', true)`,
      `select public.assign_ticket(gen_random_uuid(), '${id}')`,
    ]) {
      await expect(as(db, id, () => q(sql))).rejects.toThrow(denied);
    }
    await expect(as(db, id, () => q(`update profiles set role = 'admin' where id = $1`, [id]))).rejects.toThrow(denied);
    await expect(as(db, id, () => q(`insert into staff_members (profile_id) values ($1)`, [id]))).rejects.toThrow(denied);
  });

  it("no se aceptan cuentas sin correo (p. ej. proveedores que no lo entregan)", async () => {
    await expect(q(`insert into auth.users (id, email) values (gen_random_uuid(), null)`)).rejects.toThrow(/email_required/);
  });
});

describe("publicación de versiones legales", () => {
  it("solo quien gestiona lo legal publica; la versión anterior queda retirada y el histórico intacto", async () => {
    const admin = (await q<{ id: string }>(`select id from profiles where role = 'admin' limit 1`))[0].id;
    const cli = await createUser(db, "legal.cli@gmail.com");
    const [{ v }] = await as(db, admin, () => q<{ v: number }>(`select public.next_legal_version('privacy') v`));
    expect(v).toBe(1);
    expect((await as(db, cli, () => q<{ v: number | null }>(`select public.next_legal_version('privacy') v`)))[0].v).toBeNull();
    const [{ id: d1 }] = await as(db, admin, () => q<{ id: string }>(`insert into legal_documents (slug, version, title, content) values ('privacy', 1, 'Privacidad', 'texto v1') returning id`));
    await expect(as(db, cli, () => q(`select public.publish_legal_document($1)`, [d1]))).rejects.toThrow(denied);
    await as(db, admin, () => q(`select public.publish_legal_document($1)`, [d1]));
    await as(db, cli, () => q(`select public.accept_legal_document($1)`, [d1]));
    const [{ id: d2 }] = await as(db, admin, () => q<{ id: string }>(`insert into legal_documents (slug, version, title, content) values ('privacy', 2, 'Privacidad', 'texto v2') returning id`));
    await as(db, admin, () => q(`select public.publish_legal_document($1)`, [d2]));
    const rows = await q<{ version: number; status: string }>(`select version, status from legal_documents where slug = 'privacy' order by version`);
    expect(rows).toEqual([{ version: 1, status: "retired" }, { version: 2, status: "published" }]);
    expect((await q(`select 1 from legal_acceptances where legal_document_id = $1 and profile_id = $2`, [d1, cli])).length).toBe(1);
    await expect(as(db, admin, () => q(`select public.publish_legal_document($1)`, [d2]))).rejects.toThrow(/document_not_draft/);
    await expect(as(db, admin, () => q(`update legal_documents set content = 'cambio' where id = $1`, [d2]))).rejects.toThrow(/immutable_legal_version/);
    await expect(as(db, admin, () => q(`delete from legal_documents where id = $1`, [d2]))).rejects.toThrow(/immutable_legal_version/);
  });
});
