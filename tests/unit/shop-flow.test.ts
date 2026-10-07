import { describe, expect, it } from "vitest";
import { COMPATIBILITY_NOTE, matchHintRules } from "@/lib/ai/product-hints";
import { buildCartMessage, cartWhatsappUrl } from "@/lib/catalog/whatsapp";
import { buildDraft, clearAllDrafts, draftKey, parseDraft, shouldPersist } from "@/lib/drafts";
import { effectiveStatus, equipmentWhere, paidNextStep, progressSteps, ticketMessage } from "@/lib/domain/ticket-flow";
import { safeReturnTo, withParam } from "@/lib/navigation";
import { derivePaymentUi, PAYMENT_LABEL, PAYMENT_MESSAGE, returnMessage } from "@/lib/payments/state";
import { addLine, cartCount, MAX_LINES, MAX_QTY, parseCart, removeLine, setQty } from "@/lib/shop/cart";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("carrito del Shop (solo ids y cantidades)", () => {
  it("agrega, suma cantidades, cambia y quita", () => {
    let c = addLine([], A);
    c = addLine(c, A);
    c = addLine(c, B, 2);
    expect(c).toEqual([{ productId: A, qty: 2 }, { productId: B, qty: 2 }]);
    expect(cartCount(c)).toBe(4);
    c = setQty(c, A, 4);
    expect(c[0].qty).toBe(4);
    c = setQty(c, B, 0); // cantidad 0 = quitar
    expect(c.map((l) => l.productId)).toEqual([A]);
    expect(removeLine(c, A)).toEqual([]);
  });
  it("tope de cantidad por producto y de líneas; ids inválidos se ignoran", () => {
    expect(addLine([{ productId: A, qty: MAX_QTY }], A)[0].qty).toBe(MAX_QTY);
    expect(setQty([{ productId: A, qty: 1 }], A, 99)[0].qty).toBe(MAX_QTY);
    expect(addLine([], "no-es-uuid")).toEqual([]);
    const many = Array.from({ length: MAX_LINES + 5 }, (_, i) => ({ productId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, qty: 1 }));
    expect(parseCart(JSON.stringify(many))).toHaveLength(MAX_LINES);
  });
  it("lectura defensiva: JSON roto, tipos raros y repetidos", () => {
    expect(parseCart(null)).toEqual([]);
    expect(parseCart("{no json")).toEqual([]);
    expect(parseCart('{"a":1}')).toEqual([]);
    expect(parseCart(JSON.stringify([{ productId: A, qty: 1 }, { productId: A, qty: 3 }, { productId: B, qty: 1.5 }, { productId: B, qty: -1 }, { productId: 5, qty: 1 }, null]))).toEqual([{ productId: A, qty: 1 }]);
    expect(parseCart(JSON.stringify([{ productId: A.toUpperCase(), qty: 99 }]))).toEqual([{ productId: A, qty: MAX_QTY }]);
  });
  it("no guarda precios ni nombres (lo que no se guarda no se puede manipular)", () => {
    const c = parseCart(JSON.stringify([{ productId: A, qty: 1, price: 1, name: "x" }]));
    expect(Object.keys(c[0]).sort()).toEqual(["productId", "qty"]);
  });
});

describe("WhatsApp del carrito: un solo mensaje con todos los productos", () => {
  const lines = [
    { name: "AMD Ryzen 5 9600X", ref: "100-100001405WOF", price: 1056000, qty: 1 },
    { name: "Mouse Logitech M185", ref: "M185", price: 84000, qty: 2 },
    { name: "Cable HDMI 2.0", ref: null, price: 21600, qty: 1 },
  ];
  it("incluye cada producto con referencia, precio publicado y cantidad, el subtotal y entrega pendiente", () => {
    const m = buildCartMessage(lines);
    expect(m.startsWith("Hola TechnoUltra 👋")).toBe(true);
    expect(m).toContain("Quiero consultar la compra de los siguientes productos:");
    expect(m).toContain("1. AMD Ryzen 5 9600X\nReferencia: 100-100001405WOF\nPrecio publicado: $1.056.000\nCantidad: 1");
    expect(m).toContain("2. Mouse Logitech M185\nReferencia: M185\nPrecio publicado: $84.000\nCantidad: 2");
    expect(m).toContain("3. Cable HDMI 2.0\nPrecio publicado: $21.600\nCantidad: 1"); // sin referencia no se inventa una
    expect(m).toContain("Subtotal productos: $1.245.600"); // 1.056.000 + 2 × 84.000 + 21.600
    expect(m).toContain("Entrega:\nPendiente de confirmar");
    expect(m.trimEnd().endsWith("¿Me pueden confirmar disponibilidad y coordinar la entrega?")).toBe(true);
  });
  it("no hace parecer que TechnoUltra desconoce su precio", () => {
    expect(buildCartMessage(lines)).not.toMatch(/precio actual|precio final|cu[aá]nto cuesta/i);
  });
  it("usa los textos configurados por el SUPERADMIN", () => {
    const m = buildCartMessage(lines, { intro: "Quiero estos productos:", closing: "¿Los tienen listos?" });
    expect(m).toContain("Quiero estos productos:");
    expect(m).not.toContain("siguientes productos");
    expect(m.trimEnd().endsWith("¿Los tienen listos?")).toBe(true);
  });
  it("URL al número de TechnoUltra, bien codificada (acentos, emojis, saltos de línea, símbolos)", () => {
    const withSymbols = [{ name: "Cable USB-C & HDMI 100% #1 +2", ref: "A/B", price: 18000, qty: 1 }];
    const url = cartWhatsappUrl(withSymbols);
    expect(url.startsWith("https://wa.me/573183943465?text=")).toBe(true);
    expect(url).not.toMatch(/\s/);
    expect(url.split("?text=")[1]).not.toMatch(/[&#+ ]/);
    expect(decodeURIComponent(url.split("?text=")[1])).toBe(buildCartMessage(withSymbols));
  });
});

describe("borradores de formularios", () => {
  it("nunca guarda contraseñas, códigos, tokens, tarjetas, documentos ni archivos", () => {
    for (const [name, type] of [["password", "text"], ["contrasena", "password"], ["newPassword", "text"], ["otp", "text"], ["code", "text"], ["token", "text"], ["card_number", "text"], ["documentNumber", "text"], ["avatar", "file"], ["csrf", "hidden"], ["$ACTION_ID_abc", "hidden"]] as const) {
      expect(shouldPersist(name, type), `${name}/${type}`).toBe(false);
    }
    for (const [name, type] of [["email", "email"], ["problem", "text"], ["brand", "text"], ["model", "text"], ["line1", "text"]] as const) expect(shouldPersist(name, type)).toBe(true);
  });
  it("construye el borrador sin campos vacíos y con límites de tamaño", () => {
    expect(buildDraft({ a: "", b: "" })).toBeNull();
    const d = buildDraft({ problem: "x".repeat(9000), email: "a@b.co" }, 1000);
    expect(d?.v.problem).toHaveLength(5000);
    expect(d?.at).toBe(1000);
  });
  it("vence a las 24 h y descarta lo corrupto, lo del futuro y los campos sensibles", () => {
    const fresh = JSON.stringify({ at: 1_000_000, v: { problem: "se calienta", password: "secreto" } });
    expect(parseDraft(fresh, 1_000_000 + 60_000)?.v).toEqual({ problem: "se calienta" }); // aunque alguien lo manipule, la contraseña no vuelve
    expect(parseDraft(fresh, 1_000_000 + 25 * 3600_000)).toBeNull();
    expect(parseDraft("{roto", 0)).toBeNull();
    expect(parseDraft(JSON.stringify({ at: 5_000_000, v: { a: "x" } }), 1000)).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });
  it("la clave separa persona, ruta y formulario (la query string no cuenta)", () => {
    const k = draftKey("user-1", "/c/solicitar/diagnostico-basico?equipo=abc", "solicitud");
    expect(k).toBe("tu:draft:v1:user-1:/c/solicitar/diagnostico-basico:solicitud");
    expect(draftKey("user-2", "/c/solicitar/diagnostico-basico", "solicitud")).not.toBe(k);
    expect(draftKey("user-1", "/c/equipos/nuevo", "solicitud")).not.toBe(k);
    expect(draftKey("", "/login", "login")).toContain(":anon:");
  });
  it("al cerrar sesión se borran todos los borradores (o solo los de una persona)", () => {
    const store = new Map<string, string>([["tu:draft:v1:u1:/a:f", "1"], ["tu:draft:v1:u2:/a:f", "1"], ["otra-cosa", "1"]]);
    const api = { get length() { return store.size; }, key: (i: number) => [...store.keys()][i] ?? null, removeItem: (k: string) => void store.delete(k) };
    clearAllDrafts(api, "u1");
    expect([...store.keys()].sort()).toEqual(["otra-cosa", "tu:draft:v1:u2:/a:f"]);
    clearAllDrafts(api);
    expect([...store.keys()]).toEqual(["otra-cosa"]);
  });
});

describe("retorno seguro (sin redirecciones abiertas)", () => {
  it("acepta rutas internas de la app y conserva la consulta", () => {
    expect(safeReturnTo("/c/solicitar/diagnostico-basico")).toBe("/c/solicitar/diagnostico-basico");
    expect(safeReturnTo("/c/solicitar/x?equipo=1")).toBe("/c/solicitar/x?equipo=1");
    expect(safeReturnTo("/tienda/carrito")).toBe("/tienda/carrito");
  });
  it.each(["//evil.com", "https://evil.com", "http://localhost", "javascript:alert(1)", "/\\evil.com", "\\\\evil.com", "/c/../../etc/passwd", "/c//evil", "/login", "/api/secret", "evil.com", "", " ", "/c/x\nSet-Cookie: a=b", "/c/\u0000", `/c/${"a".repeat(400)}`])("rechaza %j", (bad) => {
    expect(safeReturnTo(bad)).toBeNull();
  });
  it("no acepta tipos que no sean texto y usa el valor de respaldo", () => {
    expect(safeReturnTo(undefined)).toBeNull();
    expect(safeReturnTo(123)).toBeNull();
    expect(safeReturnTo({ a: 1 }, "/c")).toBe("/c");
    expect(safeReturnTo("//x", "/c")).toBe("/c");
  });
  it("agrega el equipo recién creado a la ruta de retorno", () => {
    expect(withParam("/c/solicitar/diagnostico-basico", "equipo", A)).toBe(`/c/solicitar/diagnostico-basico?equipo=${A}`);
    expect(withParam("/c/solicitar/x?a=1", "equipo", A)).toBe(`/c/solicitar/x?a=1&equipo=${A}`);
    expect(withParam(`/c/solicitar/x?equipo=viejo`, "equipo", A)).toBe(`/c/solicitar/x?equipo=${A}`);
  });
});

describe("estados del pago (sin nombrar al proveedor)", () => {
  const row = (status: string, at = "2026-10-07T10:00:00Z") => ({ status: status as never, provider: "mercadopago", created_at: at });
  it("sin pagos: se puede pagar", () => expect(derivePaymentUi([], false)).toEqual({ state: "none", canPay: true, canResume: false }));
  it("pendiente = «en validación»: NO se ofrece «Pagar» otra vez, solo continuar el mismo pago", () => {
    expect(derivePaymentUi([row("pending")], false)).toEqual({ state: "validating", canPay: false, canResume: true });
  });
  it("aprobado (o ya liquidado en el concepto) = «confirmado»: nunca se vuelve a cobrar", () => {
    expect(derivePaymentUi([row("approved")], false)).toEqual({ state: "confirmed", canPay: false, canResume: false });
    expect(derivePaymentUi([], true).state).toBe("confirmed"); // prepaid_at / crédito / paid_at mandan aunque no se vea la fila
    expect(derivePaymentUi([row("approved", "2026-10-07T09:00:00Z"), row("pending", "2026-10-07T11:00:00Z")], false).canPay).toBe(false);
  });
  it("rechazado o cancelado permite reintento; vencido permite uno nuevo", () => {
    expect(derivePaymentUi([row("rejected")], false)).toEqual({ state: "rejected", canPay: true, canResume: false });
    expect(derivePaymentUi([row("cancelled")], false).canPay).toBe(true);
    expect(derivePaymentUi([row("expired")], false)).toEqual({ state: "expired", canPay: true, canResume: false });
  });
  it("reembolsado no permite pagar de nuevo", () => expect(derivePaymentUi([row("refunded")], false)).toEqual({ state: "refunded", canPay: false, canResume: false }));
  it("usa el pago MÁS reciente para decidir", () => {
    expect(derivePaymentUi([row("rejected", "2026-10-07T08:00:00Z"), row("pending", "2026-10-07T09:00:00Z")], false).state).toBe("validating");
    expect(derivePaymentUi([row("pending", "2026-10-07T08:00:00Z"), row("expired", "2026-10-07T09:00:00Z")], false).state).toBe("expired");
  });
  it("ningún texto visible menciona a Mercado Pago", () => {
    const all = [...Object.values(PAYMENT_LABEL), ...Object.values(PAYMENT_MESSAGE), returnMessage("exito")?.text, returnMessage("pendiente")?.text, returnMessage("fallo")?.text].join(" ");
    expect(all).not.toMatch(/mercado/i);
    expect(PAYMENT_LABEL.validating).toBe("Pago en validación");
    expect(PAYMENT_LABEL.confirmed).toBe("Pago confirmado");
    expect(PAYMENT_MESSAGE.validating).toBe("Estamos validando tu pago. Te avisaremos cuando quede confirmado.");
    expect(returnMessage("exito")).toEqual({ tone: "ok", text: PAYMENT_MESSAGE.validating });
    expect(returnMessage("fallo")?.tone).toBe("error");
    expect(returnMessage("otra")).toBeNull();
  });
});

describe("estado del ticket: «Recibido» solo para el equipo", () => {
  it("sin acta de recepción es «Solicitud recibida»; con acta, «Equipo recibido»", () => {
    expect(effectiveStatus("received", false, "store")).toBe("requested");
    expect(effectiveStatus("received", true, "store")).toBe("equipment_received");
    expect(effectiveStatus("received", true, "pickup")).toBe("equipment_received");
    expect(effectiveStatus("diagnosing", false, "store")).toBe("diagnosing");
  });
  it("el soporte remoto nunca dice «Equipo recibido»", () => expect(effectiveStatus("received", true, "remote")).toBe("requested"));
  it("el stepper con equipo físico no empieza por «Recibido»", () => {
    const f = progressSteps("received", false, "store");
    expect(f?.steps).toEqual(["Solicitud", "Equipo recibido", "Diagnóstico", "Aprobación", "Servicio", "Entrega"]);
    expect(f?.current).toBe(0);
    expect(progressSteps("received", true, "store")?.current).toBe(1);
    expect(progressSteps("diagnosing", true, "store")?.current).toBe(2);
    expect(progressSteps("awaiting_approval", true, "home")?.current).toBe(3);
    expect(progressSteps("in_service", true, "pickup")?.current).toBe(4);
    expect(progressSteps("awaiting_part", true, "pickup")?.current).toBe(4);
    expect(progressSteps("ready", true, "pickup")?.current).toBe(5);
    expect(progressSteps("delivered", true, "pickup")?.current).toBe(6); // todo completado
    expect(progressSteps("cancelled", true, "store")).toBeNull();
  });
  it("el soporte remoto no tiene paso de equipo", () => {
    const f = progressSteps("received", false, "remote");
    expect(f?.steps).toEqual(["Solicitud", "Diagnóstico", "Aprobación", "Servicio", "Cierre"]);
    expect(progressSteps("diagnosing", false, "remote")?.current).toBe(1);
    expect(progressSteps("delivered", false, "remote")?.current).toBe(5);
  });
  it("dónde está el equipo, según la modalidad", () => {
    expect(equipmentWhere("received", false, "pickup")).toBe("Coordinaremos contigo la recogida del equipo en la dirección indicada.");
    expect(equipmentWhere("received", false, "home")).toBe("Nuestro técnico se pondrá en contacto contigo para coordinar la visita.");
    expect(equipmentWhere("received", false, "store")).toBe("Aún no tenemos tu equipo. Puedes entregarlo en el punto acordado.");
    expect(equipmentWhere("received", false, "remote")).toBe("No necesitas entregar físicamente el equipo.");
    expect(equipmentWhere("diagnosing", true, "store")).toBe("Tu equipo está con TechnoUltra.");
  });
  it("mensaje tras el pago, según la modalidad (no uno genérico)", () => {
    expect(paidNextStep("home")).toContain("coordinar la visita a la dirección indicada");
    expect(paidNextStep("pickup")).toContain("coordinar la recogida del equipo");
    expect(paidNextStep("store")).toBe("Tu solicitud está en proceso. Te indicaremos cuándo puedes llevar el equipo.");
    expect(paidNextStep("remote")).toContain("no necesitas entregar el equipo");
    for (const m of ["home", "pickup", "store", "remote"]) expect(paidNextStep(m)).toMatch(/^Tu solicitud está en proceso\./);
  });
  it("una solicitud nueva no dice que tenemos el equipo", () => {
    expect(ticketMessage("requested", "store")).not.toMatch(/ya tenemos tu equipo/i);
    expect(ticketMessage("equipment_received", "store")).toMatch(/ya tenemos tu equipo/i);
    expect(ticketMessage("requested", "remote")).toMatch(/soporte remoto/i);
  });
});

describe("productos relacionados con el diagnóstico", () => {
  it("solo hay sugerencias cuando el texto menciona el síntoma", () => {
    expect(matchHintRules("Mi computador está muy lento y tarda en prender").map((r) => r.id)).toContain("storage");
    expect(matchHintRules("Se calienta demasiado y se apaga solo").map((r) => r.id)).toContain("heat");
    expect(matchHintRules("Quiero una limpieza general")).toEqual([]);
  });
  it("las causas detectadas también cuentan", () => {
    expect(matchHintRules("No sé qué tiene", ["Sobrecalentamiento por polvo"]).map((r) => r.id)).toContain("heat");
  });
  it("la nota de compatibilidad existe y no promete compatibilidad", () => {
    expect(COMPATIBILITY_NOTE).toBe("Conviene verificar compatibilidad antes de comprar.");
    for (const r of matchHintRules("lento, caliente, sin internet, teclado dañado, usb")) expect(r.reason).not.toMatch(/compatible con tu|garantiz/i);
  });
});
