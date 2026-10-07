import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let owner: string, tech: string, cli: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501|immutable/i;
const draft = async (status = "draft", title = "Pregunta de prueba") =>
  (await q<{ id: string }>(`insert into knowledge_entries (category, title, question, answer, status) values ('ayuda', $1, '¿Algo de prueba?', 'Respuesta de prueba.', $2) returning id`, [title, status]))[0].id;

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@technoultra.com");
  await makeAdmin(db, owner);
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, owner, tech);
  cli = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
}, 180000);

describe("base de conocimiento: contenido inicial", () => {
  it("las preguntas frecuentes iniciales están publicadas y las de datos dinámicos apuntan a su fuente (sin precios copiados)", async () => {
    const rows = await q<{ answer: string; source_type: string | null }>(`select answer, source_type from knowledge_entries where status = 'published'`);
    expect(rows.length).toBeGreaterThan(15);
    expect(rows.filter((r) => /\{price\}|\{cities\}|\{home_fees\}/.test(r.answer)).every((r) => r.source_type !== null)).toBe(true);
    expect(rows.some((r) => /\$\s?\d{2}\.\d{3}/.test(r.answer))).toBe(false); // ningún importe escrito a mano
  });
});

describe("lectura: solo lo publicado para clientes; todo para el SUPERADMIN", () => {
  it("el cliente ve entradas publicadas y NO borradores ni archivadas", async () => {
    const d = await draft("draft", "Borrador secreto");
    const a = await draft("archived", "Archivada");
    const p = await draft("published", "Publicada de prueba");
    const ids = (await as(db, cli, () => q<{ id: string }>(`select id from knowledge_entries`))).map((r) => r.id);
    expect(ids).toContain(p);
    expect(ids).not.toContain(d);
    expect(ids).not.toContain(a);
    const all = (await as(db, owner, () => q<{ id: string }>(`select id from knowledge_entries`), { aal: "aal2" })).map((r) => r.id);
    expect(all).toEqual(expect.arrayContaining([p, d, a]));
  });
  it("sin sesión (anónimo) no se lee la base de conocimiento", async () => {
    await expect(as(db, null, () => q(`select 1 from knowledge_entries`))).rejects.toThrow(denied);
  });
});

describe("escritura: solo el SUPERADMIN con MFA", () => {
  it("cliente y técnico no pueden crear, editar ni publicar", async () => {
    const id = await draft();
    for (const who of [cli, tech]) {
      await expect(as(db, who, () => q(`insert into knowledge_entries (category, title, question, answer) values ('ayuda','Hack','¿Hack?','x')`), { aal: "aal2" })).rejects.toThrow(denied);
      const r = await as(db, who, () => q(`update knowledge_entries set status = 'published', answer = 'cambiada' where id = $1 returning id`, [id]), { aal: "aal2" }).catch(() => []);
      expect(r.length).toBe(0);
    }
    expect((await q<{ status: string }>(`select status from knowledge_entries where id = $1`, [id]))[0].status).toBe("draft");
  });
  it("el SUPERADMIN sin MFA (aal1) tampoco escribe", async () => {
    await expect(as(db, owner, () => q(`insert into knowledge_entries (category, title, question, answer) values ('ayuda','Sin MFA','¿Sin MFA?','x')`), { aal: "aal1" })).rejects.toThrow(denied);
  });
  it("el SUPERADMIN con MFA crea, publica y archiva; las validaciones de la tabla se respetan", async () => {
    const [{ id }] = await as(db, owner, () => q<{ id: string }>(`insert into knowledge_entries (category, title, question, answer, created_by) values ('ayuda','Mi FAQ','¿Mi pregunta?','Mi respuesta.', $1) returning id`, [owner]), { aal: "aal2" });
    await as(db, owner, () => q(`update knowledge_entries set status = 'published' where id = $1`, [id]), { aal: "aal2" });
    expect((await as(db, cli, () => q(`select 1 from knowledge_entries where id = $1`, [id]))).length).toBe(1);
    await as(db, owner, () => q(`update knowledge_entries set status = 'archived' where id = $1`, [id]), { aal: "aal2" });
    expect((await as(db, cli, () => q(`select 1 from knowledge_entries where id = $1`, [id]))).length).toBe(0);
    await expect(q(`insert into knowledge_entries (category, title, question, answer) values ('inventada','x y z','abc','def')`)).rejects.toThrow();
    await expect(q(`insert into knowledge_entries (category, title, question, answer, status) values ('ayuda','x y z','abc','def','otro')`)).rejects.toThrow();
    await expect(q(`insert into knowledge_entries (category, title, question, answer, source_type) values ('ayuda','x y z','abc','def','sql')`)).rejects.toThrow();
  });
});

describe("versiones inmutables", () => {
  it("cada cambio de contenido sube la versión y deja una copia que nadie puede editar ni borrar", async () => {
    const id = await draft();
    await q(`update knowledge_entries set answer = 'Respuesta v2' where id = $1`, [id]);
    await q(`update knowledge_entries set status = 'published' where id = $1`, [id]);
    await q(`update knowledge_entries set priority = priority where id = $1`, [id]); // sin cambios: no sube la versión
    const e = (await q<{ version: number }>(`select version from knowledge_entries where id = $1`, [id]))[0];
    expect(e.version).toBe(3);
    const versions = await q<{ version: number; snapshot: { answer: string } }>(`select version, snapshot from knowledge_entry_versions where entry_id = $1 order by version`, [id]);
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
    expect(versions[1].snapshot.answer).toBe("Respuesta v2");
    await expect(q(`update knowledge_entry_versions set snapshot = '{}' where entry_id = $1`, [id])).rejects.toThrow(denied);
    await expect(q(`delete from knowledge_entry_versions where entry_id = $1`, [id])).rejects.toThrow(denied);
    expect((await as(db, cli, () => q(`select 1 from knowledge_entry_versions`), { aal: "aal2" })).length).toBe(0); // el historial es solo del SUPERADMIN
  });
});

describe("métricas de IA (sin contenido de conversaciones)", () => {
  it("solo el SUPERADMIN las lee; ningún cliente ni técnico las lee o las escribe", async () => {
    await q(`insert into ai_usage (route, topic, provider, model, tokens_input, tokens_output, latency_ms) values ('ai','orientation','openrouter','m',100,20,900), ('faq','pagos',null,null,null,null,12)`);
    expect((await as(db, owner, () => q(`select 1 from ai_usage`), { aal: "aal2" })).length).toBe(2);
    for (const who of [cli, tech]) {
      const r = await as(db, who, () => q(`select 1 from ai_usage`), { aal: "aal2" }).catch(() => []);
      expect(r.length).toBe(0);
      await expect(as(db, who, () => q(`insert into ai_usage (route) values ('ai')`), { aal: "aal2" })).rejects.toThrow(denied);
    }
    await expect(as(db, owner, () => q(`insert into ai_usage (route) values ('ai')`), { aal: "aal2" })).rejects.toThrow(denied); // ni el SUPERADMIN escribe métricas por la API: solo el servidor
  });
  it("la tabla no tiene columnas para guardar mensajes y las rutas están acotadas", async () => {
    const cols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'ai_usage'`)).map((c) => c.column_name);
    expect(cols).not.toEqual(expect.arrayContaining(["message", "content", "prompt", "response"]));
    await expect(q(`insert into ai_usage (route) values ('otra')`)).rejects.toThrow();
  });
});
