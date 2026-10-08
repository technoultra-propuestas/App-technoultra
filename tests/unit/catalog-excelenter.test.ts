import { describe, expect, it, vi } from "vitest";
import { buildCatalog, parseCsv } from "@/lib/catalog/csv";
import { copFormat, customerPrice, normKey, normRef } from "@/lib/catalog/normalize";
import { CatalogSourceError, csvTextProvider, excelenterCsvUrlProvider } from "@/lib/catalog/provider";
import { MAX_OUTSIDE_KM, pointInRing, quoteProductShipping } from "@/lib/catalog/shipping";
import { runCatalogSync, type RpcClient } from "@/lib/catalog/sync";
import { buildWhatsappMessage, productWhatsappUrl } from "@/lib/catalog/whatsapp";

const HEADER = "referencia,nombre,marca,categoria,subcategoria,precio,cantidad,descripcion,imagen_url,activo";
const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

describe("precio: fuente + 20 % (aritmética entera exacta)", () => {
  it.each([
    [100000, 120000],
    [110000, 132000],
    [90000, 108000],
    [333333, 400000],
    [3500, 4200],
    [15000, 18000],
  ])("%i → %i", (src, out) => expect(customerPrice(src)).toBe(out));
  it("es +20 % del precio fuente (no el 20 % del final) y rechaza valores inválidos", () => {
    expect(customerPrice(100000) - 100000).toBe(20000);
    for (const bad of [0, -5, NaN, Infinity]) expect(() => customerPrice(bad)).toThrow();
  });
  it("formato COP", () => expect(copFormat(120000)).toBe("$120.000"));
});

describe("normalización de identidad", () => {
  it("una sola categoría para «Periféricos», «PERIFERICOS» y «Periféricos »", () => {
    expect(new Set(["Periféricos", "PERIFERICOS", "Periféricos ", "  perifericos"].map(normKey)).size).toBe(1);
  });
  it("la referencia se normaliza sin perder significado", () => expect(normRef("  Generico   n ")).toBe("GENERICO N"));
});

describe("lector CSV", () => {
  it("campos con comillas, comas y saltos de línea dentro de la descripción", () => {
    const rows = parseCsv(csv('R1,"Mouse, inalámbrico",ACME,Periféricos,Mouse,50000,1,"Línea 1\n\nLínea 2 con ""comillas""",https://x/y.webp,TRUE'));
    expect(rows[1][1]).toBe("Mouse, inalámbrico");
    expect(rows[1][7]).toBe('Línea 1\n\nLínea 2 con "comillas"');
    expect(rows[1]).toHaveLength(10);
  });
});

describe("catálogo: categorías, subcategorías, duplicados y faltantes", () => {
  const data = csv(
    "A1,Mouse A,ACME,Periféricos,Mouse,90000,1,d,https://x/a.webp,TRUE",
    "A2,Teclado B,ACME,PERIFERICOS,Teclados,40000,1,d,https://x/b.webp,TRUE",
    "P1,Ryzen 5,AMD,Componentes,Procesadores,490000,1,d,https://x/p.webp,TRUE",
    "P1,Ryzen 5,AMD,Componentes,Procesadores,490000,1,d,,TRUE", // duplicado exacto sin imagen
    "G ,Lector USB,GEN,Almacenamiento,Memorias USB,80000,1,d,https://x/g1.webp,TRUE",
    "G,Audífonos TWS,GEN,Accesorios,Audífonos,65000,1,d,https://x/g2.webp,TRUE", // misma referencia, otro producto
    "T1,Decodificador,HARVIC,Redes,,65000,1,d,https://x/t.webp,TRUE", // sin subcategoría
    "X1,Sin stock,ACME,Periféricos,Mouse,10000,0,d,https://x/x.webp,TRUE",
    "X2,Inactivo,ACME,Periféricos,Mouse,10000,3,d,https://x/x2.webp,FALSE",
    ",,,,,,1,,,", // fila vacía
  );
  const { items, report } = buildCatalog(parseCsv(data));
  const byId = (id: string) => items.find((i) => i.source_product_id === id);
  it("importa todas las filas válidas y descarta solo las vacías", () => {
    expect(report.rows).toBe(10);
    expect(report.empty_rows).toBe(1);
    expect(items).toHaveLength(8);
  });
  it("fusiona duplicados exactos conservando la fila con imagen", () => {
    expect(report.merged_duplicates).toEqual([{ ref: "P1", name: "Ryzen 5", count: 2 }]);
    expect(byId("P1")?.image_url).toBe("https://x/p.webp");
  });
  it("misma referencia con nombres distintos → productos distintos con id interno único y estable", () => {
    const ids = items.filter((i) => i.source_ref.trim() === "G").map((i) => i.source_product_id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((i) => /^G~[0-9A-F]{6}$/.test(i))).toBe(true);
    expect(report.disambiguated[0].ref).toBe("G");
    // estable ante el orden de las filas
    const again = buildCatalog(parseCsv(csv("G,Audífonos TWS,GEN,Accesorios,Audífonos,65000,1,d,,TRUE", "G ,Lector USB,GEN,Almacenamiento,Memorias USB,80000,1,d,,TRUE"))).items;
    expect(again.map((i) => i.source_product_id).sort()).toEqual([...ids].sort());
  });
  it("categoría y subcategoría quedan exactamente como en el catálogo fuente, sin duplicados y sin invertir el orden", () => {
    const per = report.categories.find((c) => normKey(c.category) === "perifericos");
    expect(report.categories.filter((c) => normKey(c.category) === "perifericos")).toHaveLength(1);
    expect(per?.subcategories.map((s) => s.name).sort()).toEqual(["Mouse", "Teclados"]);
    expect(report.categories.find((c) => c.category === "Componentes")?.subcategories[0].name).toBe("Procesadores");
    expect(report.categories.some((c) => c.category === "Procesadores")).toBe(false);
    expect(byId("P1")).toMatchObject({ category: "Componentes", subcategory: "Procesadores" });
  });
  it("marca lo incompleto sin inventar nada", () => {
    expect(report.without_subcategory).toBe(1);
    expect(byId("T1")?.subcategory).toBeNull();
    expect(report.without_category).toBe(0);
  });
  it("«activo» en falso equivale a sin disponibilidad; stock 0 se conserva", () => {
    expect(byId("X2")?.stock).toBe(0);
    expect(byId("X1")?.stock).toBe(0);
    expect(byId("A1")?.stock).toBe(1);
  });
  it("precio ausente o inválido se reporta y queda nulo (no se publica)", () => {
    const r = buildCatalog(parseCsv(csv("Z1,Sin precio,ACME,Periféricos,Mouse,,1,d,,TRUE", "Z2,Precio cero,ACME,Periféricos,Mouse,0,1,d,,TRUE")));
    expect(r.items.every((i) => i.price === null)).toBe(true);
    expect(r.report.issues.filter((i) => i.type === "invalid_price")).toHaveLength(2);
  });
  it("rechaza archivos sin las columnas esperadas", () => {
    expect(() => buildCatalog(parseCsv("a,b\n1,2"))).toThrow(/Columnas faltantes/);
  });
});

describe("WhatsApp", () => {
  const p = { name: "SSD Kingston 480 GB", ref: "SA400S37", price: 120000, brand: "Kingston", category: "Almacenamiento", subcategory: "SSD SATA" };
  it("mensaje con producto, referencia, precio y cantidad (formato de la ficha)", () => {
    const m = buildWhatsappMessage(p);
    expect(m).toContain("Hola TechnoUltra 👋");
    expect(m).toContain("Quiero consultar la compra de:");
    expect(m).toContain("Producto: SSD Kingston 480 GB");
    expect(m).toContain("Referencia: SA400S37");
    expect(m).toContain("Precio: $120.000");
    expect(m).toContain("Cantidad: 1");
    expect(m).toContain("¿Me pueden confirmar disponibilidad y coordinar la entrega?");
    expect(m).not.toMatch(/precio actual/i); // el precio publicado ya es el comercial: no se pregunta por él
  });
  it("URL al número de TechnoUltra, codificada sin romper acentos, emojis ni saltos de línea", () => {
    const url = productWhatsappUrl(p);
    expect(url.startsWith("https://wa.me/573183943465?text=")).toBe(true);
    const decoded = decodeURIComponent(url.split("?text=")[1]);
    expect(decoded).toBe(buildWhatsappMessage(p));
    expect(url).not.toMatch(/\s/);
    expect(url).toContain("%F0%9F%91%8B"); // 👋
  });
  it("caracteres especiales del nombre (& # % +) no rompen el enlace", () => {
    const url = productWhatsappUrl({ name: "Cable USB-C & HDMI 100% #1 +2", ref: null, price: 18000 });
    const decoded = decodeURIComponent(url.split("?text=")[1]);
    expect(decoded).toContain("Producto: Cable USB-C & HDMI 100% #1 +2");
    expect(decoded).not.toContain("Referencia:");
  });
});

describe("domicilio de productos (perímetro urbano oficial de Cali)", () => {
  it("punto dentro del perímetro → $10.000", () => {
    expect(quoteProductShipping({ lat: 3.4516, lng: -76.532 })).toMatchObject({ zone: "cali_urban", fee: 10000 }); // centro de Cali
    expect(quoteProductShipping({ lat: 3.4263, lng: -76.5405 })).toMatchObject({ zone: "cali_urban", fee: 10000 }); // sur-occidente urbano
  });
  it("punto fuera del perímetro pero cercano → $20.000", () => {
    expect(quoteProductShipping({ lat: 3.2606, lng: -76.5395 })).toMatchObject({ zone: "outside", fee: 20000 }); // Jamundí
    expect(quoteProductShipping({ lat: 3.5833, lng: -76.4939 })).toMatchObject({ zone: "outside", fee: 20000 }); // Yumbo
  });
  it("ubicación indeterminada o fuera de las zonas configuradas → confirmar manualmente (sin tarifa)", () => {
    for (const q of [null, undefined, { lat: NaN, lng: 0 }, { lat: 6.2442, lng: -75.5812 } /* Medellín */, { lat: 40.4, lng: -3.7 }]) {
      expect(quoteProductShipping(q as never)).toMatchObject({ zone: "unknown", fee: null });
    }
    expect(MAX_OUTSIDE_KM).toBeGreaterThan(0);
  });
  it("no depende del texto «Cali»: solo de coordenadas", () => {
    // @ts-expect-error la API no acepta texto de dirección
    expect(quoteProductShipping("Cali")).toMatchObject({ zone: "unknown", fee: null });
  });
  it("el polígono es una geometría cerrada válida (punto en polígono)", () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(pointInRing({ lng: 5, lat: 5 }, sq)).toBe(true);
    expect(pointInRing({ lng: 15, lat: 5 }, sq)).toBe(false);
  });
  it("no mezcla con las tarifas de servicios técnicos (módulo y constantes propios)", async () => {
    const cfg = await import("@/lib/catalog/config");
    expect(cfg.PRODUCT_SHIPPING_CALI_URBAN).toBe(10000);
    expect(cfg.PRODUCT_SHIPPING_CALI_OUTSIDE).toBe(20000);
    expect(Object.keys(cfg).some((k) => /^(HOME|PICKUP|SERVICE)/i.test(k))).toBe(false);
  });
});

describe("sincronización: la fuente falla → no se toca el catálogo", () => {
  const rpcCalls: [string, Record<string, unknown>][] = [];
  const client = (result: { data: unknown; error: { code: string } | null }): RpcClient => ({
    rpc: async (fn, args) => {
      rpcCalls.push([fn, args]);
      return fn === "sync_catalog" ? result : { data: null, error: null };
    },
  });
  it("fuente caída → registra el error y NUNCA llama a sync_catalog (ni oculta ni cambia precios)", async () => {
    rpcCalls.length = 0;
    const failing = { source: "EXCELENTER", fetchCatalog: async () => { throw new CatalogSourceError("unavailable", "caída"); } };
    const r = await runCatalogSync(client({ data: null, error: null }), failing, "automatic");
    expect(r).toMatchObject({ ok: false, status: "error", reason: "unavailable" });
    expect(rpcCalls.map((c) => c[0])).toEqual(["record_catalog_sync_failure"]);
  });
  it("sin URL de fuente configurada → not_configured (no hay sincronización ni scraping); el SUPERADMIN lo ve, el cron no genera ruido", async () => {
    rpcCalls.length = 0;
    expect(await runCatalogSync(client({ data: null, error: null }), excelenterCsvUrlProvider({}), "manual")).toMatchObject({ ok: false, reason: "not_configured" });
    expect(rpcCalls.map((c) => c[0])).toEqual(["record_catalog_sync_failure"]);
    rpcCalls.length = 0;
    expect(await runCatalogSync(client({ data: null, error: null }), excelenterCsvUrlProvider({}), "automatic")).toMatchObject({ ok: false, reason: "not_configured" });
    expect(rpcCalls).toEqual([]);
  });
  it("HTTP 500 o red caída de la fuente → unavailable", async () => {
    for (const impl of [vi.fn(async () => new Response("x", { status: 500 })), vi.fn(async () => { throw new Error("net"); })]) {
      rpcCalls.length = 0;
      const p = excelenterCsvUrlProvider({ EXCELENTER_CATALOG_CSV_URL: "https://fuente.example/catalogo.csv", EXCELENTER_CATALOG_TOKEN: "t0k3n-secreto" }, impl as unknown as typeof fetch);
      expect(await runCatalogSync(client({ data: null, error: null }), p, "manual")).toMatchObject({ ok: false, reason: "unavailable" });
      expect(rpcCalls.map((c) => c[0])).toEqual(["record_catalog_sync_failure"]);
    }
  });
  it("el token solo viaja a la fuente (cabecera) y la URL debe ser https", async () => {
    const f = vi.fn(async () => new Response(csv("A1,Mouse,ACME,Periféricos,Mouse,90000,1,d,https://x/a.webp,TRUE"), { status: 200 }));
    const items = await excelenterCsvUrlProvider({ EXCELENTER_CATALOG_CSV_URL: "https://fuente.example/c.csv", EXCELENTER_CATALOG_TOKEN: "abc" }, f as unknown as typeof fetch).fetchCatalog();
    expect(items).toHaveLength(1);
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: "Bearer abc" });
    await expect(excelenterCsvUrlProvider({ EXCELENTER_CATALOG_CSV_URL: "http://inseguro/c.csv" }).fetchCatalog()).rejects.toThrow(CatalogSourceError);
  });
  it("fuente correcta → envía los productos normalizados a sync_catalog y devuelve el resumen", async () => {
    rpcCalls.length = 0;
    const r = await runCatalogSync(client({ data: { status: "success", created: 1 }, error: null }), csvTextProvider(csv("A1,Mouse,ACME,Periféricos,Mouse,90000,1,d,https://x/a.webp,TRUE")), "manual", "u-1");
    expect(r).toMatchObject({ ok: true, status: "success" });
    const [fn, args] = rpcCalls[0];
    expect(fn).toBe("sync_catalog");
    expect(args).toMatchObject({ p_source: "EXCELENTER", p_run_type: "manual", p_actor: "u-1" });
    expect((args.p_items as { source_product_id: string }[])[0].source_product_id).toBe("A1");
  });
  it("si la base rechaza la corrida (fuente vacía / caída brusca) se informa como error", async () => {
    const r = await runCatalogSync(client({ data: { status: "error", reason: "suspicious_drop" }, error: null }), csvTextProvider(csv("A1,Mouse,ACME,Periféricos,Mouse,90000,1,d,,TRUE")), "automatic");
    expect(r).toMatchObject({ ok: false, reason: "suspicious_drop" });
  });
});
