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
