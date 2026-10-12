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
    const keyWidth = 180 - PAGE.margin - 8; // la etiqueta se parte en líneas dentro de su columna: nunca invade el valor
    for (const [k, v] of pairs) {
      if (v === null || v === undefined || v === "") continue;
      const keys = this.wrap(k, this.bold, 9, keyWidth);
      const lines = this.wrap(v, this.font, 10, PAGE.w - PAGE.margin - 190);
      const rows = Math.max(keys.length, lines.length, 1);
      this.ensure(rows * 14 + 2);
      keys.forEach((l, i) => this.page().drawText(l, { x: PAGE.margin, y: this.y - 10 - i * 14, size: 9, font: this.bold, color: MUTED }));
      lines.forEach((l, i) => this.page().drawText(l, { x: 180, y: this.y - 10 - i * 14, size: 10, font: this.font, color: INK }));
      this.y -= rows * 14;
    }
  }

  /**
   * Resumen de importes: conceptos a la izquierda (con salto de línea si son largos) e importes ALINEADOS A LA DERECHA en su propia
   * columna. El concepto nunca invade el importe, ni en pantalla, ni al imprimir, ni en páginas estrechas.
   */
  amounts(rows: { label: string; amount: string; strong?: boolean; muted?: boolean }[]) {
    const right = PAGE.w - PAGE.margin;
    const amountCol = 130;
    const labelWidth = right - PAGE.margin - amountCol - 12;
    for (const r of rows) {
      const size = r.strong ? 12 : 10;
      const lf = r.strong ? this.bold : this.font;
      const labels = this.wrap(r.label, lf, size, labelWidth);
      const lh = size + 5;
      const h = labels.length * lh + (r.strong ? 6 : 2);
      this.ensure(h + 4);
      if (r.strong) {
        this.page().drawLine({ start: { x: PAGE.margin, y: this.y - 1 }, end: { x: right, y: this.y - 1 }, thickness: 0.8, color: LINE });
        this.y -= 6;
      }
      const color = r.muted ? MUTED : INK;
      labels.forEach((l, i) => this.page().drawText(l, { x: PAGE.margin, y: this.y - size - i * lh, size, font: lf, color }));
      const amt = winAnsi(r.amount);
      const af = r.strong ? this.bold : this.font;
      this.page().drawText(amt, { x: right - af.widthOfTextAtSize(amt, size), y: this.y - size, size, font: af, color });
      this.y -= labels.length * lh + 2;
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

  /**
   * Cuadrícula de fotografías (3 por fila) con su rótulo. Cada foto conserva su proporción; las que no se pueden incrustar (formato no
   * admitido, archivo dañado) se listan como «no disponible» en lugar de fallar o inventar contenido.
   */
  async photoGrid(items: { label: string; bytes: Uint8Array | null }[]) {
    const cols = 3;
    const gap = 10;
    const cw = (PAGE.w - PAGE.margin * 2 - gap * (cols - 1)) / cols;
    const ch = 124;
    for (let i = 0; i < items.length; i += cols) {
      this.ensure(ch + 30);
      const row = items.slice(i, i + cols);
      for (const [j, it] of row.entries()) {
        const x = PAGE.margin + j * (cw + gap);
        const top = this.y;
        this.page().drawRectangle({ x, y: top - ch, width: cw, height: ch, borderColor: LINE, borderWidth: 0.8, color: rgb(0.965, 0.965, 0.961) });
        let drawn = false;
        if (it.bytes) {
          try {
            const isPng = it.bytes[0] === 0x89 && it.bytes[1] === 0x50;
            const img = isPng ? await this.doc.embedPng(it.bytes) : await this.doc.embedJpg(it.bytes);
            const s = Math.min((cw - 8) / img.width, (ch - 8) / img.height);
            const w = img.width * s;
            const h = img.height * s;
            this.page().drawImage(img, { x: x + (cw - w) / 2, y: top - ch + (ch - h) / 2, width: w, height: h });
            drawn = true;
          } catch {
            drawn = false;
          }
        }
        if (!drawn) this.page().drawText("Foto no disponible", { x: x + 8, y: top - ch / 2, size: 9, font: this.font, color: MUTED });
        this.page().drawText(winAnsi(it.label).slice(0, 38), { x, y: top - ch - 11, size: 8.5, font: this.bold, color: INK });
      }
      this.y -= ch + 22;
    }
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
