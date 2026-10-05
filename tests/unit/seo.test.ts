import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({}) }));

import { breadcrumbLd, faqLd, jsonLd, localBusinessLd, organizationLd } from "@/lib/seo";
import { notificationHref } from "@/lib/notifications";
import { slugify } from "@/lib/domain/service";

describe("JSON-LD", () => {
  it("escapa < para impedir cerrar la etiqueta <script> (XSS)", () => {
    const out = jsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>"); // el dato original se conserva al leerlo
  });
  it("LocalBusiness solo existe si el administrador cargó una dirección real", () => {
    expect(localBusinessLd({ name: "TechnoUltra" }, ["Cali"])).toBeNull();
    const lb = localBusinessLd({ name: "TechnoUltra", address: "Calle 1 # 2-3", phone: "+57 300 000 0000" }, ["Cali"]);
    expect(lb?.["@type"]).toBe("LocalBusiness");
  });
  it("la organización no inventa teléfono ni correo", () => {
    const o = organizationLd({ name: "TechnoUltra" }, ["Cali", "Palmira"]);
    expect(o).not.toHaveProperty("telephone");
    expect(o).not.toHaveProperty("email");
    expect((o.areaServed as { name: string }[]).map((a) => a.name)).toEqual(["Cali", "Palmira", "Colombia"]);
  });
  it("breadcrumb y FAQ tienen la estructura esperada", () => {
    expect(breadcrumbLd([{ name: "Inicio", path: "/" }, { name: "X", path: "/x" }]).itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(faqLd([{ q: "¿a?", a: "b" }]).mainEntity[0].acceptedAnswer.text).toBe("b");
  });
  it("slugify genera URLs de ciudad limpias", () => {
    expect(slugify("Jamundí")).toBe("jamundi");
    expect(slugify("Palmira")).toBe("palmira");
  });
});

describe("destinos de avisos", () => {
  it("cada rol recibe rutas de su propia zona", () => {
    expect(notificationHref("client", "ticket", "abc")).toBe("/c/tickets/abc");
    expect(notificationHref("technician", "ticket", "abc")).toBe("/b/tickets/abc");
    expect(notificationHref("client", "document", "d1")).toBe("/c/documentos/d1");
    expect(notificationHref("technician", "document", "d1")).toBeNull();
    expect(notificationHref("admin", "payment", "p1")).toBe("/b/pedidos");
  });
  it("tipos desconocidos o sin entidad no generan destino (nunca una URL arbitraria)", () => {
    expect(notificationHref("client", "https://evil.com", "x")).toBeNull();
    expect(notificationHref("client", null, null)).toBeNull();
    expect(notificationHref("client", "ticket", null)).toBeNull();
  });
});
