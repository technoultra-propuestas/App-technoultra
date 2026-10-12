// PDF del acta de recepción con FOTOGRAFÍAS REALES en Cloudinary: se suben 4 fotos distintas (3000×2000, color y rótulo propios) por la interfaz,
// se confirma la recepción, se descarga el PDF y se inspecciona: una imagen por foto, en el orden del acta, con buena resolución y el color de SU foto
// (correspondencia con el ticket); después se firma y se verifica la constancia. Control de acceso: sin sesión, otro cliente y URL de Cloudinary sin firma.
// Requiere CLOUDINARY_* reales en .env.local (como los escenarios 03 y 17).
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { clientLogin, staffLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";
import { createUser, psql } from "../lib/fixtures.mjs";

export const title = "PDF del acta con fotografías reales de Cloudinary: correspondencia, calidad, firma, constancia y permisos";

const q = (sql) => psql(sql);
const OUT = resolve("tests/e2e/.out");
const COLORS = { front: [214, 40, 40], back: [30, 140, 60], left: [40, 80, 200], damage: [230, 190, 20] }; // rojo, verde, azul, amarillo
const inspect = (pdf, png) => {
  const r = spawnSync("python", [resolve("tests/e2e/lib/pdf-inspect.py"), pdf, png ?? ""], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  if (r.status !== 0) throw new Error("pdf-inspect: " + r.stderr.slice(0, 300));
  return JSON.parse(r.stdout);
};
const near = (a, b, tol = 45) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

export async function run({ b, rep, state, save, sb, env }) {
  mkdirSync(OUT, { recursive: true });
  // 4 fotos reales de 3000×2000 (JPEG con degradado, ruido y rótulo): cada una con su color dominante para comprobar la correspondencia.
  const gen = spawnSync("python", ["-c", `
import sys, random
from PIL import Image, ImageDraw
out = sys.argv[1]
cols = {"front": (214,40,40), "back": (30,140,60), "left": (40,80,200), "damage": (230,190,20)}
for slot, c in cols.items():
    im = Image.new("RGB", (3000, 2000), c)
    d = ImageDraw.Draw(im)
    for i in range(0, 2000, 4):
        k = int(40 * i / 2000)
        d.line([(0, i), (3000, i)], fill=(max(c[0]-k,0), max(c[1]-k,0), max(c[2]-k,0)))
    random.seed(slot)
    for _ in range(300):
        x, y = random.randint(0, 2900), random.randint(0, 1900)
        d.rectangle([x, y, x+60, y+30], outline=(255,255,255))
    d.text((120, 120), "E2E " + slot.upper(), fill=(255,255,255))
    im.save(f"{out}/real-{slot}.jpg", quality=88)
`, OUT], { encoding: "utf8" });
  if (gen.status !== 0) throw new Error("no se pudieron generar las fotos: " + gen.stderr.slice(0, 300));

  const profile = q(`select id from profiles where email = '${state.client.email}'`);
  const customer = q(`select id from customers where profile_id = '${profile}'`);
  q(`insert into services (slug, name, kind, base_price, allowed_modalities, is_diagnostic_fee, requires_equipment, allow_online_payment) values ('diagnostico-tecnico-e2e', 'Diagnóstico técnico', 'technical', 39900, '{store,home,pickup}', true, false, true) on conflict (slug) do nothing`);
  const svc = q(`select id from services where slug = 'diagnostico-tecnico-e2e'`);
  const t = q(`insert into tickets (customer_id, service_id, modality, problem, assigned_to) values ('${customer}', '${svc}', 'store', 'PDF con fotos reales (E2E 19).', '${state.techId}') returning id`).split("\n")[0];

  // ---------------------------------------------------------------- 1 · subir 4 fotos reales y confirmar la recepción
  await staffLogin(b, state.tech).then((r) => {
    state.tech.secret = r.secret;
    save();
  });
  await b.viewport(1280, 900);
  await b.goto(`/b/tickets/${t}`, 2500);
  for (const slot of Object.keys(COLORS)) {
    const sel = `li[data-slot=${slot}] input[type=file]:not([capture])`;
    for (let a = 0; a < 3 && q(`select count(*) from evidence where ticket_id = '${t}' and slot = '${slot}'`) === "0"; a++) {
      await b.waitHydrated(sel);
      await b.setFiles(sel, [resolve(OUT, `real-${slot}.jpg`)], 0);
      for (let k = 0; k < 80 && q(`select count(*) from evidence where ticket_id = '${t}' and slot = '${slot}'`) === "0"; k++) await sleep(500);
    }
  }
  const ids = q(`select string_agg(slot || '=' || cloudinary_public_id, ',' order by slot) from evidence where ticket_id = '${t}'`);
  rep.check("las 4 fotos reales se subieron a Cloudinary y están ligadas a ESTE ticket (su carpeta lleva el id del ticket)", ids.split(",").length === 4 && ids.split(",").every((x) => x.includes(t)), ids.slice(0, 200));
  await b.waitHydrated("form [name=reason]");
  await b.fill("reason", "Equipo sin imagen (E2E 19, fotos reales).");
  await b.check("accessories");
  await sleep(500);
  await b.submit("reason");
  for (let i = 0; i < 60 && Number(q(`select count(*) from documents where ticket_id = '${t}' and doc_type = 'reception'`)) === 0; i++) await sleep(500);
  const acta = q(`select id from documents where ticket_id = '${t}' and doc_type = 'reception'`);
  rep.check("al confirmar la recepción se genera el acta, pendiente de firma", /^[0-9a-f-]{36}$/.test(acta) && q(`select status from documents where id = '${acta}'`) === "generated");

  // ---------------------------------------------------------------- 2 · inspección del PDF sin firmar
  const fetchPdf = async (id, file) => {
    const r = await b.eval(`(async () => { const r = await fetch('/documentos/${id}'); const buf = new Uint8Array(await r.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192)); return { ok: r.ok, type: r.headers.get('content-type'), b64: btoa(s) }; })()`);
    writeFileSync(file, Buffer.from(r.b64, "base64"));
    return r;
  };
  const f1 = resolve(OUT, "acta-sin-firmar.pdf");
  const r1 = await fetchPdf(acta, f1);
  const p1 = inspect(f1, resolve(OUT, "acta-sin-firmar"));
  rep.check("el técnico descarga el PDF (application/pdf)", r1.ok && r1.type === "application/pdf");
  rep.check("el PDF trae EXACTAMENTE 4 fotografías (una por vista)", p1.images.length === 4, JSON.stringify(p1.images.map((i) => `${i.w}x${i.h}`)));
  rep.check("calidad: cada foto se incrusta a ≥ 600 px de ancho y conserva su proporción 3:2 (sin deformar)", p1.images.every((i) => i.w >= 600 && Math.abs(i.w / i.h - 1.5) < 0.03), JSON.stringify(p1.images.map((i) => `${i.w}x${i.h}`)));
  const order = ["front", "back", "left", "damage"];
  const match = order.map((s, i) => near(p1.images[i]?.rgb ?? [0, 0, 0], COLORS[s]));
  rep.check("correspondencia: las fotos aparecen en el orden del acta y cada una es la subida a ESE ticket (color dominante)", match.every(Boolean), JSON.stringify(p1.images.map((i) => i.rgb)));
  rep.check("el rótulo de cada foto y los datos del acta están en el PDF", ["Vista frontal y pantalla", "Parte posterior o tapa", "Laterales y puertos", "Daños visibles o vista adicional", "Equipo sin imagen"].every((s) => p1.text.includes(s)));
  rep.check("el PDF no revela URLs de Cloudinary ni de almacenamiento", !/cloudinary|supabase\.co|res\.cloudinary/i.test(p1.text));

  // ---------------------------------------------------------------- 3 · permisos
  const cloud = env.CLOUDINARY_CLOUD_NAME ?? process.env.CLOUDINARY_CLOUD_NAME;
  const pub = ids.split(",")[0].split("=")[1];
  if (cloud) {
    const raw = await fetch(`https://res.cloudinary.com/${cloud}/image/authenticated/${pub}.jpg`);
    rep.check("la URL de Cloudinary SIN firma no entrega la foto (activo privado)", !raw.ok, String(raw.status));
  }
  await b.clearCookies();
  const anon = await b.eval(`(async () => { const r = await fetch('/documentos/${acta}', { redirect: 'manual' }); return { type: r.headers.get('content-type') || '', status: r.status }; })()`);
  rep.check("sin sesión el PDF del acta NO se entrega", !/pdf/.test(anon.type), JSON.stringify(anon));
  const otherMail = `otro.cliente.${Date.now()}@example.com`;
  await createUser(sb, { email: otherMail, password: "Prueba-E2E-1234!", fullName: "Otro Cliente E2E" });
  await clientLogin(b, { email: otherMail, password: "Prueba-E2E-1234!" });
  const other = await b.eval(`(async () => { const r = await fetch('/documentos/${acta}', { redirect: 'manual' }); return { type: r.headers.get('content-type') || '', status: r.status }; })()`);
  rep.check("otro cliente NO puede abrir el acta de este ticket", !/pdf/.test(other.type), JSON.stringify(other));

  // ---------------------------------------------------------------- 4 · el cliente firma → constancia de aceptación
  await clientLogin(b, state.client);
  await b.goto(`/c/documentos/${acta}`, 2500);
  await b.waitHydrated("canvas");
  await b.draw("canvas");
  await b.check("accept");
  await sleep(500);
  await b.submit("accept");
  rep.check("el cliente firma el acta", await b.waitText(/Firmado por/, 20000));
  const f2 = resolve(OUT, "acta-firmada.pdf");
  await fetchPdf(acta, f2);
  const p2 = inspect(f2, resolve(OUT, "acta-firmada"));
  const sha = q(`select sha256 from documents where id = '${acta}'`);
  const code = q(`select code from documents where id = '${acta}'`);
  rep.check("el PDF firmado agrega una página y la firma manuscrita como imagen", p2.pages === p1.pages + 1 && p2.images.length === 5, `${p1.pages}->${p2.pages} páginas, ${p2.images.length} imágenes`);
  rep.check("la constancia incluye firmante, canal, huella SHA-256 de la versión exacta y la declaración aceptada", /Constancia de firma electr/.test(p2.text) && p2.text.replace(/\s+/g, "").includes(sha) && /sesi[oó]n autenticada/.test(p2.text) && p2.text.includes(code) && /confirmo que le[ií] y acepto/.test(p2.text), sha.slice(0, 16));
  rep.check("las 4 fotos del PDF firmado siguen siendo las mismas (integridad del contenido firmado)", JSON.stringify(p2.images.slice(0, 4).map((i) => i.rgb)) === JSON.stringify(p1.images.map((i) => i.rgb)));
  await b.goto("/c/documentos", 2500);
  rep.check("el acta firmada está disponible en «Documentos» del cliente y enlaza a su PDF", /Acta de recepci/.test(await b.text()) && (await b.eval(`!!document.querySelector('a[href="/c/documentos/${acta}"]')`)));
  rep.check("la huella del documento no cambió al firmar", q(`select (document_sha256 = (select sha256 from documents where id = '${acta}')) from document_signatures where document_id = '${acta}'`) === "t");
}
