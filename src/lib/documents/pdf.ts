import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

const ORANGE = rgb(1, 0.541, 0);
const INK = rgb(0.071, 0.071, 0.071);
const MUTED = rgb(0.361, 0.361, 0.349);
const LINE = rgb(0.925, 0.925, 0.914);
const PAGE = { w: 595.28, h: 841.89, margin: 48 };

/** pdf-lib con fuentes estándar solo soporta WinAnsi: se reemplazan caracteres fuera de rango para no fallar. */
export const winAnsi = (s: string) =>
  Array.from(
    s
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/…/g, "..."),
  )
    .map((ch) => {
      const c = ch.codePointAt(0) ?? 63;
      return c === 9 || c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) ? ch : "?";
    })
    .join("");

export type PdfMeta = { title: string; code: string; version: number; generatedAt: Date; /** datos públicos del negocio (CRM → Configuración); si faltan no se imprime nada inventado */ business?: { name?: string; phone?: string; address?: string } };

/** Constructor mínimo de PDFs: encabezado de marca, secciones, pares clave/valor, tablas y pie con código y versión. */
export class PdfBuilder {
  private pages: PDFPage[] = [];
  private y = 0;
  private constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private meta: PdfMeta,
  ) {}

  static async create(meta: PdfMeta) {
    const doc = await PDFDocument.create();
    doc.setTitle(winAnsi(`${meta.title} ${meta.code}`));
    doc.setAuthor("TechnoUltra");
    doc.setCreator("TechnoUltra");
    doc.setCreationDate(meta.generatedAt);
    doc.setModificationDate(meta.generatedAt);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const b = new PdfBuilder(doc, font, bold, meta);
    b.newPage(true);
    return b;
  }

  private page() {
    return this.pages[this.pages.length - 1];
  }

  private newPage(first = false) {
    const p = this.doc.addPage([PAGE.w, PAGE.h]);
    this.pages.push(p);
    this.y = PAGE.h - PAGE.margin;
    if (first) {
      p.drawText("TECHNOULTRA", { x: PAGE.margin, y: this.y - 14, size: 18, font: this.bold, color: INK });
      p.drawRectangle({ x: PAGE.margin, y: this.y - 24, width: 40, height: 3, color: ORANGE });
      p.drawText(winAnsi(this.meta.title), { x: PAGE.margin, y: this.y - 52, size: 20, font: this.bold, color: INK });
      this.y -= 72;
      this.line(`${this.meta.code} · Versión ${this.meta.version} · ${this.meta.generatedAt.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" })}`, 9, MUTED);
      this.y -= 8;
    }
  }

  private ensure(h: number) {
    if (this.y - h < PAGE.margin + 24) this.newPage();
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of winAnsi(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          out.push(line);
          line = word;
        } else line = next;
      }
      out.push(line);
    }
    return out;
  }

  private line(text: string, size = 10, color = INK, font?: PDFFont, x = PAGE.margin) {
    const f = font ?? this.font;
    for (const l of this.wrap(text, f, size, PAGE.w - PAGE.margin - x)) {
      this.ensure(size + 4);
      this.page().drawText(l, { x, y: this.y - size, size, font: f, color });
      this.y -= size + 4;
    }
  }

  section(title: string) {
    this.ensure(34);
    this.y -= 10;
    this.page().drawText(winAnsi(title.toUpperCase()), { x: PAGE.margin, y: this.y - 10, size: 10, font: this.bold, color: ORANGE });
    this.y -= 16;
    this.page().drawLine({ start: { x: PAGE.margin, y: this.y }, end: { x: PAGE.w - PAGE.margin, y: this.y }, thickness: 0.6, color: LINE });
    this.y -= 6;
  }

  kv(pairs: [string, string | null | undefined][]) {
    for (const [k, v] of pairs) {
      if (v === null || v === undefined || v === "") continue;
      this.ensure(16);
      this.page().drawText(winAnsi(k), { x: PAGE.margin, y: this.y - 10, size: 9, font: this.bold, color: MUTED });
      const lines = this.wrap(v, this.font, 10, PAGE.w - PAGE.margin - 190);
      for (const l of lines) {
        this.ensure(14);
        this.page().drawText(l, { x: 180, y: this.y - 10, size: 10, font: this.font, color: INK });
        this.y -= 14;
      }
      if (lines.length === 0) this.y -= 14;
    }
  }

  para(text: string) {
    this.line(text, 10, INK);
    this.y -= 4;
  }

  table(head: string[], rows: string[][], widths: number[]) {
    const total = PAGE.w - PAGE.margin * 2;
    const sum = widths.reduce((a, b) => a + b, 0);
    const cols = widths.map((w) => (w / sum) * total);
    const draw = (cells: string[], f: PDFFont, color = INK) => {
      const wrapped = cells.map((c, i) => this.wrap(c, f, 9, cols[i] - 6));
      const h = Math.max(...wrapped.map((w) => w.length)) * 12 + 4;
      this.ensure(h);
      let x = PAGE.margin;
      wrapped.forEach((lines, i) => {
        lines.forEach((l, j) => {
          const right = i > 0 && /^[-$0-9.,\s%]+$/.test(l);
          const tx = right ? x + cols[i] - 6 - f.widthOfTextAtSize(l, 9) : x + 3;
          this.page().drawText(l, { x: tx, y: this.y - 10 - j * 12, size: 9, font: f, color });
        });
        x += cols[i];
      });
      this.y -= h;
      this.page().drawLine({ start: { x: PAGE.margin, y: this.y + 1 }, end: { x: PAGE.w - PAGE.margin, y: this.y + 1 }, thickness: 0.4, color: LINE });
    };
    draw(head, this.bold, MUTED);
    rows.forEach((r) => draw(r, this.font));
    this.y -= 4;
  }

  note(text: string) {
    this.y -= 6;
    this.line(text, 8.5, MUTED);
  }

  async finish(): Promise<Uint8Array> {
    this.pages.forEach((p, i) => {
      p.drawText(winAnsi(`${this.meta.code} · v${this.meta.version} · Página ${i + 1} de ${this.pages.length}`), {
        x: PAGE.margin,
        y: 28,
        size: 8,
        font: this.font,
        color: MUTED,
      });
      p.drawText("TechnoUltra · technoultra.com", { x: PAGE.w - PAGE.margin - 120, y: 28, size: 8, font: this.font, color: MUTED });
      const b = this.meta.business;
      const contact = [b?.name, b?.phone, b?.address].filter(Boolean).join(" · ");
      if (contact) p.drawText(winAnsi(contact.slice(0, 120)), { x: PAGE.margin, y: 16, size: 8, font: this.font, color: MUTED });
    });
    return this.doc.save();
  }
}
