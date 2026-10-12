"""Inspecciona un PDF del acta (PyMuPDF) para las pruebas E2E: páginas, texto, imágenes incrustadas con su tamaño y color dominante.
Uso: python pdf-inspect.py <archivo.pdf> [carpeta-para-pngs]   ->   imprime un JSON.
No es parte de la aplicación: solo verifica los PDFs generados contra Cloudinary real."""
import json
import sys

import pymupdf

sys.stdout.reconfigure(encoding="utf-8")

path = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else None
doc = pymupdf.open(path)
res = {"pages": doc.page_count, "text": "", "images": [], "meta_title": doc.metadata.get("title")}
for i, page in enumerate(doc):
    res["text"] += page.get_text() + "\n"
    for info in page.get_images(full=True):
        xref = info[0]
        pm = pymupdf.Pixmap(doc, xref)
        if pm.alpha:
            pm = pymupdf.Pixmap(pm, 0)
        if pm.colorspace and pm.colorspace.n != 3:
            pm = pymupdf.Pixmap(pymupdf.csRGB, pm)
        samples = pm.samples
        n = pm.n
        px = pm.width * pm.height
        step = max(1, px // 4000)
        rs = gs = bs = c = 0
        for k in range(0, px, step):
            o = k * n
            rs += samples[o]
            gs += samples[o + 1]
            bs += samples[o + 2]
            c += 1
        res["images"].append({"page": i + 1, "w": pm.width, "h": pm.height, "rgb": [round(rs / c), round(gs / c), round(bs / c)]})
    if out:
        page.get_pixmap(dpi=110).save(f"{out}-p{i + 1}.png")
print(json.dumps(res, ensure_ascii=False))
