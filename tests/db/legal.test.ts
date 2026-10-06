import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, makeAdmin, makeTechnician, type Db } from "./harness";

let db: Db;
let owner: string, tech: string, cli: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const denied = /permission denied|row-level security|forbidden|42501/i;

const draft = async (slug: string, content: string) =>
  (await q<{ id: string }>(`insert into legal_documents (slug, version, title, content, status, requires_acceptance) values ($1, coalesce((select max(version) from legal_documents where slug=$1),0)+1, 'Título de prueba', $2, 'draft', true) returning id`, [slug, content]))[0].id;

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@technoultra.com");
  await makeAdmin(db, owner);
  tech = await createUser(db, "tec@technoultra.com");
  await makeTechnician(db, owner, tech);
  cli = await createUser(db, "a@gmail.com", { full_name: "Cliente A" });
}, 180000);

describe("paquete jurídico", () => {
  it("acepta los 9 documentos del paquete (incluidos autorización de datos y consentimiento de IA)", async () => {
    for (const s of ["terms", "privacy", "data_policy", "data_authorization", "service_terms", "warranty_policy", "purchase_terms", "returns_policy", "ai_consent"]) await draft(s, `## 1. Sección\n\nTexto de ${s}.`);
    await expect(draft("hack", "x")).rejects.toThrow(/legal_documents_slug_check/);
  });
  it("un borrador con campos «[PENDIENTE: …]» NO se puede publicar; sin ellos sí, y queda inmutable", async () => {
    const id = await draft("consents", "## 1. Datos\n\nResponsable: [PENDIENTE: CC/NIT].");
    await expect(as(db, owner, () => q(`select public.publish_legal_document($1)`, [id]))).rejects.toThrow(/legal_placeholders_pending/);
    await as(db, owner, () => q(`update legal_documents set content = replace(content, '[PENDIENTE: CC/NIT]', '123456789') where id = $1`, [id]));
    await as(db, owner, () => q(`select public.publish_legal_document($1)`, [id]));
    expect((await q<{ s: string }>(`select status s from legal_documents where id = $1`, [id]))[0].s).toBe("published");
    await expect(q(`update legal_documents set content = 'cambiado' where id = $1`, [id])).rejects.toThrow(/immutable_legal_version/);
  });
  it("el hash se recalcula en BD al editar un borrador", async () => {
    const id = await draft("terms", "## 1. A\n\nUno.");
    const h1 = (await q<{ h: string }>(`select content_sha256 h from legal_documents where id = $1`, [id]))[0].h;
    await as(db, owner, () => q(`update legal_documents set content = '## 1. A\n\nDos.' where id = $1`, [id]));
    expect((await q<{ h: string }>(`select content_sha256 h from legal_documents where id = $1`, [id]))[0].h).not.toBe(h1);
  });
  it("el público ve solo lo publicado; técnico y cliente no publican ni editan", async () => {
    const pubId = (await q<{ id: string }>(`select id from legal_documents where status = 'published' limit 1`))[0].id;
    const anon = await as(db, null, () => q<{ status: string }>(`select status from legal_documents`));
    expect(anon.every((r) => r.status === "published")).toBe(true);
    for (const who of [tech, cli]) {
      await expect(as(db, who, () => q(`select public.publish_legal_document($1)`, [pubId]))).rejects.toThrow(denied);
      await expect(as(db, who, () => q(`insert into legal_documents (slug, version, title, content) values ('terms', 99, 'Hack', 'texto de prueba largo')`))).rejects.toThrow(denied);
    }
  });
});
