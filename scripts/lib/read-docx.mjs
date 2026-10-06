// Lector mínimo de .docx → bloques estructurados (títulos, párrafos, listas, tablas). Sin dependencias nativas: usa jszip.
// Se usa SOLO para la carga inicial de los textos legales (scripts/import-legal.mjs); la app nunca lee Word en ejecución.
import JSZip from "jszip";
import { readFileSync } from "node:fs";

const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

function runsToText(xml) {
  let out = "";
  for (const m of xml.matchAll(/<w:(?:t|tab|br)\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:t>)/g)) {
    if (m[0].startsWith("<w:tab")) out += "\t";
    else if (m[0].startsWith("<w:br")) out += "\n";
    else out += decode(m[1] ?? "");
  }
  return out;
}
const isBold = (pXml) => {
  const runs = [...pXml.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)].map((m) => m[0]).filter((r) => /<w:t\b/.test(r));
  return runs.length > 0 && runs.every((r) => /<w:b\b(?![a-zA-Z])(?!\s*w:val="(?:0|false)")/.test(r));
};

/** @returns {Promise<{type:'h1'|'h2'|'h3'|'p'|'li'|'oli'|'table', text?:string, rows?:string[][], bold?:boolean}[]>} */
export async function readDocx(path) {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const xml = await zip.file("word/document.xml").async("string");
  const body = xml.slice(xml.indexOf("<w:body>"));
  const blocks = [];
  // recorre párrafos y tablas en orden
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g;
  for (const m of body.matchAll(re)) {
    const x = m[0];
    if (x.startsWith("<w:tbl>")) {
      const rows = [...x.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((r) =>
        [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => [...c[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => runsToText(p[0]).trim()).filter(Boolean).join(" ")),
      );
      blocks.push({ type: "table", rows });
      continue;
    }
    const text = runsToText(x).replace(/[ \t]+\n/g, "\n").trim();
    if (!text) continue;
    const style = /<w:pStyle w:val="([^"]+)"/.exec(x)?.[1] ?? "";
    const numbered = /<w:numPr>/.test(x);
    let type = "p";
    if (/^(Title|Heading ?1|Ttulo1|Titre1)$/i.test(style) || /^Heading1$/i.test(style)) type = "h1";
    else if (/^Heading ?2$/i.test(style)) type = "h2";
    else if (/^Heading ?3$/i.test(style)) type = "h3";
    else if (numbered || /List/i.test(style)) type = "li";
    blocks.push({ type, text, bold: isBold(x), style });
  }
  return blocks;
}
