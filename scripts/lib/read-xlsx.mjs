// Lector mínimo de .xlsx (solo lectura; sin dependencias nativas). Soporta prefijos XML (x:), cadenas compartidas e inline.
// Se usa SOLO en la carga inicial del catálogo: la app nunca lee Excel en runtime.
import JSZip from "jszip";
import { readFileSync } from "node:fs";

const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");

const strip = (xml, tag) => {
  // devuelve el texto de todas las <t> de un bloque (soporta prefijo x:)
  const out = [];
  const re = new RegExp(`<(?:\\w+:)?t(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?t>`, "g");
  let m;
  while ((m = re.exec(xml))) out.push(decode(m[1]));
  return out.join("");
};

const colIndex = (ref) => {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function readWorkbook(path) {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const text = (name) => zip.file(name)?.async("string");
  const wb = await text("xl/workbook.xml");
  const rels = await text("xl/_rels/workbook.xml.rels");
  const relMap = Object.fromEntries([...rels.matchAll(/<(?:\w+:)?Relationship\s[^>]*?>/g)].map((m) => {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    return [id, target];
  }));
  const sst = await text("xl/sharedStrings.xml");
  const shared = sst ? [...sst.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => strip(m[1])) : [];
  const sheets = {};
  for (const m of wb.matchAll(/<(?:\w+:)?sheet\s[^>]*?>/g)) {
    const name = decode(/name="([^"]+)"/.exec(m[0])[1]);
    const rid = /r:id="([^"]+)"/.exec(m[0])[1];
    let target = relMap[rid];
    target = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    const xml = await text(target);
    const rows = [];
    for (const rm of xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
      const row = [];
      for (const cm of rm[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
        const attrs = cm[1];
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
        if (!ref) continue;
        const t = /t="([^"]+)"/.exec(attrs)?.[1];
        const body = cm[2] ?? "";
        let v;
        if (t === "s") v = shared[Number(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1])];
        else if (t === "inlineStr") v = strip(body);
        else {
          const raw = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
          v = raw === undefined ? undefined : t === "str" ? decode(raw) : Number.isNaN(Number(raw)) ? decode(raw) : Number(raw);
        }
        row[colIndex(ref)] = v;
      }
      rows.push(row);
    }
    sheets[name] = rows;
  }
  return sheets;
}
