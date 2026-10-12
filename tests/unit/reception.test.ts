import { beforeEach, describe, expect, it, vi } from "vitest";
import { contactWindowText } from "@/lib/domain/pricing";
import { DAMAGES, PHOTO_SLOTS, receptionPhotoStatus } from "@/lib/domain/reception";
import { SETTINGS, parseSetting } from "@/lib/domain/settings";
import { paymentConfirmedText } from "@/lib/domain/ticket-flow";

describe("fotografías de recepción: las cuatro vistas obligatorias", () => {
  it("sin fotos: 0 de 4 y faltan las cuatro vistas con su nombre", () => {
    const s = receptionPhotoStatus([]);
    expect(s).toMatchObject({ done: 0, total: 4, complete: false });
    expect(s.missingLabels).toEqual(["Frontal y pantalla", "Posterior o tapa", "Laterales y puertos", "Daños o vista extra"]);
  });
  it("cada vista se satisface con su foto principal; con las cuatro queda completo", () => {
    expect(receptionPhotoStatus(["front", "back"]).done).toBe(2);
    expect(receptionPhotoStatus(["front", "back", "left", "damage"])).toMatchObject({ done: 4, complete: true, missingViews: [] });
  });
  it("dos fotos de la misma vista cuentan una sola vez", () => {
    expect(receptionPhotoStatus(["front", "front", "screen"]).done).toBe(1);
  });
  it("compatibilidad con recepciones anteriores: pantalla, lateral derecho y serial equivalen a sus vistas", () => {
    expect(receptionPhotoStatus(["screen", "back", "right", "serial"]).complete).toBe(true);
    // el juego antiguo (frontal, posterior, pantalla, serial) no trae laterales: queda 3 de 4
    expect(receptionPhotoStatus(["front", "back", "screen", "serial"])).toMatchObject({ done: 3, missingViews: [3] });
  });
  it("las fotos opcionales (cargador, otros…) no completan nada por sí solas; los vacíos se ignoran", () => {
    expect(receptionPhotoStatus(["charger", null]).done).toBe(0);
    expect(PHOTO_SLOTS.filter((p) => p.required)).toHaveLength(4);
  });
  it("«Otros daños» es una casilla más, junto a las ya existentes", () => {
    expect(DAMAGES).toEqual(expect.arrayContaining(["Rayones", "Golpes", "Pantalla rota", "Bisagra floja", "Teclas faltantes", "Carcasa partida", "Otros daños"]));
  });
});

describe("plazo de primer contacto (configurable) y mensaje tras el pago", () => {
  it("sin plazo configurado no se promete nada; con plazo se dice en horas o días", () => {
    expect(contactWindowText(undefined)).toBeNull();
    expect(contactWindowText(0)).toBeNull();
    expect(contactWindowText(Number("abc"))).toBeNull();
    expect(contactWindowText(4)).toBe("4 horas");
    expect(contactWindowText(1)).toBe("1 hora");
    expect(contactWindowText(24)).toBe("1 día");
    expect(contactWindowText(72)).toBe("3 días");
  });
  it("el ajuste existe, es de enteros (0 = sin plazo) y se puede leer por el cliente", () => {
    const def = SETTINGS.find((s) => s.key === "service.contact_window_hours")!;
    expect(def.isPublic).toBe(false); // privado: solo se lee en el servidor
    expect(parseSetting(def, "0").ok).toBe(true);
    expect(parseSetting(def, "24").ok).toBe(true);
    expect(parseSetting(def, "200").ok).toBe(false);
    expect(parseSetting(def, "1.5").ok).toBe(false);
  });
  it("mensaje breve por modalidad: con plazo lo cita; sin plazo NO inventa uno", () => {
    const base = { kind: "diagnosis" as const, ticketStatus: "received" };
    expect(paymentConfirmedText({ ...base, modality: "home", windowText: "24 horas" })).toBe("Te contactaremos en un máximo de 24 horas para coordinar la visita.");
    expect(paymentConfirmedText({ ...base, modality: "home", windowText: null })).toBe("Te contactaremos para coordinar la visita.");
    expect(paymentConfirmedText({ ...base, modality: "store", windowText: null })).toBe("Te indicaremos cómo coordinar la recepción de tu equipo.");
    expect(paymentConfirmedText({ ...base, modality: "store", windowText: "2 días" })).toMatch(/máximo de 2 días para coordinar la recepción/);
    expect(paymentConfirmedText({ ...base, modality: "remote", windowText: null })).toMatch(/soporte remoto/);
    const all = ["home", "pickup", "remote", "store"].map((modality) => paymentConfirmedText({ ...base, modality, windowText: null })).join(" ");
    expect(all).not.toMatch(/\b\d+\s*(horas|minutos|d[ií]as)\b/i);
  });
  it("nunca sugiere que la reparación ya empezó, y después de la recepción el texto es neutro", () => {
    for (const modality of ["home", "store", "remote"]) expect(paymentConfirmedText({ kind: "diagnosis", modality, ticketStatus: "received", windowText: "24 horas" })).not.toMatch(/inici(ó|amos la reparaci)|reparación en curso|trabajando/i);
    expect(paymentConfirmedText({ kind: "diagnosis", modality: "home", ticketStatus: "diagnosing", windowText: "24 horas" })).toBe("Tu pago está confirmado.");
    expect(paymentConfirmedText({ kind: "quote", modality: "", ticketStatus: "in_service", windowText: null, plan: "deposit" })).toBe("Recibimos tu anticipo. Estamos preparando el inicio del servicio.");
    expect(paymentConfirmedText({ kind: "quote", modality: "", ticketStatus: "in_service", windowText: "24 horas", plan: "full" })).toMatch(/máximo de 24 horas para programar el inicio/);
  });
});

// ---------------------------------------------------------------- «Confirmar recepción» (acción del servidor)
type Row = Record<string, unknown>;
const db: { existing: Row | null; evidence: { slot: string | null }[]; inserted: Row[]; updated: Row[] } = { existing: null, evidence: [], inserted: [], updated: [] };
vi.mock("@/lib/auth/session", () => ({ assertRole: vi.fn(async () => ({ id: "tech1", role: "technician" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const gen = vi.fn(async (..._a: unknown[]): Promise<{ ok: boolean; error?: string }> => ({ ok: true }));
vi.mock("@/lib/documents/generate", () => ({ generateTicketDocument: (...a: unknown[]) => gen(...a) }));
vi.mock("@/lib/tickets/auto", () => ({ advanceAfterReception: vi.fn(async () => true) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        select: () => c,
        eq: () => c,
        is: () => c,
        maybeSingle: async () => ({ data: db.existing }),
        then: (r: (v: unknown) => void) => r({ data: table === "evidence" ? db.evidence : [] }),
        insert: async (row: Row) => (db.inserted.push(row), { error: null }),
        update: (row: Row) => (db.updated.push(row), { eq: async () => ({ error: null }) }),
      });
      return c;
    },
  }),
}));
import { saveReceptionAction } from "@/app/b/tickets/reception-actions";

const form = (o: Record<string, string | string[]> = {}) => {
  const fd = new FormData();
  fd.set("ticketId", "5b1c7f0e-8f3a-4f0e-9d6b-2a4b9d7e1c11");
  fd.set("reason", "Pantalla azul");
  for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => fd.append(k, x));
  return fd;
};
const ok4 = ["front", "back", "left", "damage"].map((slot) => ({ slot }));
const init = { ok: false } as never;

describe("saveReceptionAction: confirmar recepción", () => {
  beforeEach(() => {
    Object.assign(db, { existing: null, evidence: [], inserted: [], updated: [] });
    gen.mockClear();
  });
  it("sin las cuatro fotos NO crea el acta y dice cuántas y cuáles faltan", async () => {
    db.evidence = [{ slot: "front" }];
    const r = await saveReceptionAction(init, form());
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Faltan 3 fotos obligatorias: Posterior o tapa, Laterales y puertos, Daños o vista extra/);
    expect(db.inserted).toHaveLength(0);
  });
  it("con las cuatro fotos crea el acta (daños y accesorios de listas cerradas; «Estado físico» no se toca) y avanza", async () => {
    db.evidence = ok4;
    const r = await saveReceptionAction(init, form({ damage: ["Rayones", "Inventado"], accessories: ["Cargador"], observations: "Marco abollado" }));
    expect(r).toMatchObject({ ok: true });
    expect(r.message).toMatch(/pasó a «En diagnóstico»/);
    expect(db.inserted[0]).toMatchObject({ visible_damage: ["Rayones"], accessories: ["Cargador"], observations: "Marco abollado", reason: "Pantalla azul" });
    expect(db.inserted[0]).not.toHaveProperty("physical_condition");
  });
  it("«Otros daños» exige describirlos", async () => {
    db.evidence = ok4;
    const r = await saveReceptionAction(init, form({ damage: ["Otros daños"] }));
    expect(r.ok).toBe(false);
    expect(r.fieldErrors?.observations).toBeTruthy();
    expect(db.inserted).toHaveLength(0);
  });
  it("editar un acta ya confirmada no vuelve a exigir fotos ni toca el estado físico histórico", async () => {
    db.existing = { id: "r1" };
    const r = await saveReceptionAction(init, form({ observations: "Detalle nuevo" }));
    expect(r.message).toMatch(/^Recepción actualizada\./);
    expect(db.updated[0]).not.toHaveProperty("physical_condition");
  });
  it("al confirmar genera el acta (queda pendiente de firma); si la generación falla lo dice y no pierde la recepción", async () => {
    db.evidence = ok4;
    await saveReceptionAction(init, form());
    expect(gen).toHaveBeenCalledWith("reception", "5b1c7f0e-8f3a-4f0e-9d6b-2a4b9d7e1c11", "tech1");
    gen.mockResolvedValueOnce({ ok: false, error: "x" });
    const r = await saveReceptionAction(init, form());
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/No pudimos generar el acta/);
    expect(db.inserted).toHaveLength(2);
  });
  it("editar sin cambiar nada del acta NO emite una versión nueva (no pide otra firma)", async () => {
    db.existing = { id: "r1", reason: "Pantalla azul", accessories: [], visible_damage: [], observations: null };
    await saveReceptionAction(init, form());
    expect(gen).not.toHaveBeenCalled();
  });
});
