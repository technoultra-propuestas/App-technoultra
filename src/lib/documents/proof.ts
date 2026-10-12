import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { winAnsi } from "./pdf";

export type SignatureProof = {
  docCode: string;
  docVersion: number;
  docSha256: string;
  signerName: string;
  signedAt: Date;
  channel: "client_session" | "assisted";
  capturedByName?: string | null;
  consentText: string;
  signaturePng: Uint8Array | null;
};

const INK = rgb(0.071, 0.071, 0.071);
const MUTED = rgb(0.361, 0.361, 0.349);
const ORANGE = rgb(1, 0.541, 0);

/**
 * Añade al final del PDF original una página «Constancia de firma electrónica» (firma manuscrita, firmante, fecha, canal, versión y huella).
 * Los bytes del documento original NO cambian ni su huella (que es la que quedó vinculada a la firma): la constancia se compone al
 * consultarlo, así el original sigue siendo verificable y la firma no puede atribuirse a otra versión.
 */
export async function appendSignatureProof(original: Uint8Array, p: SignatureProof): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const m = 48;
  let y = 841.89 - m;
  const text = (t: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    page.drawText(winAnsi(t), { x: m, y: y - (o.size ?? 10), size: o.size ?? 10, font: o.bold ? bold : font, color: o.color ?? INK });
    y -= (o.size ?? 10) + 5;
  };
  const wrap = (t: string, size: number, width: number) => {
    const out: string[] = [];
    let line = "";
    for (const w of winAnsi(t).split(/\s+/)) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
    return out;
  };
  page.drawText("TECHNOULTRA", { x: m, y: y - 14, size: 18, font: bold, color: INK });
  page.drawRectangle({ x: m, y: y - 24, width: 40, height: 3, color: ORANGE });
  y -= 44;
  text("Constancia de firma electrónica", { size: 20, bold: true });
  y -= 6;
  text(`Documento ${p.docCode} · versión ${p.docVersion}`, { size: 10, color: MUTED });
  y -= 14;
  const rows: [string, string][] = [
    ["Firmante", p.signerName],
    ["Fecha y hora", p.signedAt.toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" })],
    ["Canal", p.channel === "assisted" ? `Firma presencial capturada en el dispositivo del personal${p.capturedByName ? ` (${p.capturedByName})` : ""}` : "Firmada por el cliente desde su propia sesión autenticada"],
    ["Huella SHA-256 del documento firmado", p.docSha256],
  ];
  for (const [k, v] of rows) {
    text(k, { size: 9, bold: true, color: MUTED });
    for (const l of wrap(v, 10, 595.28 - m * 2)) text(l, { size: 10 });
    y -= 4;
  }
  y -= 6;
  text("Declaración aceptada", { size: 9, bold: true, color: MUTED });
  for (const l of wrap(p.consentText, 10, 595.28 - m * 2)) text(l, { size: 10 });
  y -= 14;
  text("Firma", { size: 9, bold: true, color: MUTED });
  page.drawRectangle({ x: m, y: y - 120, width: 260, height: 120, borderColor: rgb(0.8, 0.8, 0.78), borderWidth: 0.8 });
  if (p.signaturePng) {
    try {
      const img = await doc.embedPng(p.signaturePng);
      const s = Math.min(250 / img.width, 110 / img.height);
      page.drawImage(img, { x: m + 5, y: y - 115, width: img.width * s, height: img.height * s });
    } catch {
      page.drawText("Imagen de la firma no disponible", { x: m + 8, y: y - 60, size: 9, font, color: MUTED });
    }
  }
  y -= 140;
  for (const l of wrap("Esta constancia se compone al consultar el documento a partir del registro inmutable de la firma. El documento original no se modifica; su huella SHA-256 identifica la versión exacta aceptada. La validez jurídica final de la firma electrónica simple debe revisarla un abogado.", 8.5, 595.28 - m * 2)) text(l, { size: 8.5, color: MUTED });
  return doc.save();
}
