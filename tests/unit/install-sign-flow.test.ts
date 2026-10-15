import { describe, expect, it } from "vitest";
import { actaSignPrompt, clientNextAction, staffNextAction, type ClientFacts, type FlowFacts } from "@/lib/domain/next-action";
import { bannerVisible, installMode, isIOS, isIOSSafari, QUIET_DAYS, recentlyDismissed } from "@/lib/pwa/install";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0";
const IPAD_OS = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const env = (o: Partial<Parameters<typeof installMode>[0]>) => ({ ua: ANDROID, platform: "Linux armv8l", touchPoints: 5, standalone: false, hasPrompt: false, ...o });

describe("instalación de la PWA: qué se ofrece en cada dispositivo", () => {
  it("Android/escritorio con el evento del navegador: botón «Instalar» (diálogo nativo con un clic)", () => {
    expect(installMode(env({ hasPrompt: true }))).toBe("prompt");
    expect(installMode(env({ ua: DESKTOP, platform: "Win32", touchPoints: 0, hasPrompt: true }))).toBe("prompt");
    expect(bannerVisible("prompt")).toBe(true);
  });
  it("iPhone Safari: instrucciones (Compartir → Añadir a pantalla de inicio); nunca un botón que prometa instalar", () => {
    expect(installMode(env({ ua: IPHONE_SAFARI, platform: "iPhone" }))).toBe("ios-safari");
    expect(bannerVisible("ios-safari")).toBe(true);
  });
  it("iPhone con otro navegador o dentro de otra app: se pide abrir en Safari; iPadOS (se presenta como Mac táctil) también cuenta como iOS", () => {
    expect(installMode(env({ ua: IPHONE_CHROME, platform: "iPhone" }))).toBe("ios-other");
    expect(installMode(env({ ua: IPHONE_INSTAGRAM, platform: "iPhone" }))).toBe("ios-other");
    expect(isIOS(IPAD_OS, "MacIntel", 5)).toBe(true);
    expect(isIOSSafari(IPAD_OS)).toBe(true);
    expect(isIOS(DESKTOP, "Win32", 0)).toBe(false);
    expect(isIOS(IPAD_OS, "MacIntel", 0)).toBe(false); // un Mac real sin pantalla táctil
  });
  it("PWA ya instalada (standalone): no se vuelve a mostrar la invitación, ni siquiera si el navegador conserva un evento", () => {
    expect(installMode(env({ standalone: true, hasPrompt: true }))).toBe("installed");
    expect(installMode(env({ ua: IPHONE_SAFARI, platform: "iPhone", standalone: true }))).toBe("installed");
    expect(bannerVisible("installed")).toBe(false);
  });
  it("sin instalación posible: no hay botón engañoso en el aviso flotante (solo la alternativa discreta en «Más»)", () => {
    expect(installMode(env({ ua: DESKTOP, platform: "Win32", touchPoints: 0 }))).toBe("manual");
    expect(bannerVisible("manual")).toBe(false);
  });
  it("al descartar el aviso no vuelve a aparecer durante 14 días y después sí puede", () => {
    const now = Date.UTC(2026, 9, 13);
    expect(QUIET_DAYS).toBe(14);
    expect(recentlyDismissed(now - 3 * 24 * 3600_000, now)).toBe(true);
    expect(recentlyDismissed(now - 15 * 24 * 3600_000, now)).toBe(false);
    expect(recentlyDismissed(null, now)).toBe(false);
    expect(recentlyDismissed(Number.NaN, now)).toBe(false);
  });
});

const flow = (o: Partial<FlowFacts> = {}): FlowFacts => ({ status: "received", modality: "store", hasReception: true, photosComplete: true, hasDiagnosis: false, diagnosisFinalized: false, quoteStatus: null, quoteItems: 0, payment: "confirmed", quotePayable: false, checklistDone: false, hasChecklist: false, hasDelivery: false, ...o });
const client = (o: Partial<ClientFacts> = {}): ClientFacts => ({ ...flow(), ticketId: "t1", diagnosisDocId: null, quoteDocId: null, diagnosisPayable: false, receptionDocId: "d1", ...o });

describe("la firma del acta es la obligación prioritaria del cliente (estado persistido, no un aviso)", () => {
  it("acta pendiente: «Debes firmar el acta de recepción» + botón «Revisar y firmar acta» que abre ESE documento", () => {
    const p = actaSignPrompt(client({ actaPending: true }));
    expect(p).toMatchObject({ title: "Debes firmar el acta de recepción", tone: "action", primary: { label: "Revisar y firmar acta", href: "/c/documentos/d1?from=%2Fc%2Ftickets%2Ft1" } });
  });
  it("se muestra en CUALQUIER estado del ticket (también un ticket histórico ya en diagnóstico o en servicio), salvo cancelado o entregado", () => {
    for (const status of ["received", "diagnosing", "awaiting_approval", "in_service", "testing", "ready"]) expect(actaSignPrompt(client({ status, actaPending: true }))).not.toBeNull();
    for (const status of ["cancelled", "delivered"]) expect(actaSignPrompt(client({ status, actaPending: true }))).toBeNull();
  });
  it("no se muestra si está firmada, si no hay acta o si el SUPERADMIN autorizó una excepción", () => {
    expect(actaSignPrompt(client({ actaPending: false }))).toBeNull();
    expect(actaSignPrompt(client({ actaPending: true, receptionDocId: null }))).toBeNull();
    expect(actaSignPrompt(client({ actaPending: true, actaException: true }))).toBeNull();
  });
  it("«Próxima acción» del cliente no contradice la obligación: con el acta pendiente siempre es firmar, aunque el ticket diga «En diagnóstico»", () => {
    const n = clientNextAction(client({ status: "diagnosing", actaPending: true }));
    expect(n.title).toBe("Debes firmar el acta de recepción");
    expect(n.title).not.toMatch(/diagn/i);
    expect(clientNextAction(client({ status: "diagnosing", actaPending: false })).title).toMatch(/diagnóstico/i);
  });
  it("tras firmar, desaparece la acción y se muestra el siguiente paso real", () => {
    const n = clientNextAction(client({ status: "diagnosing", actaPending: false, receptionSigned: true }));
    expect(n.title).not.toMatch(/firmar/i);
  });
});

describe("«Próxima acción» del personal con el acta pendiente", () => {
  it("recibido con recepción y sin firma: la acción principal es esperar/gestionar la firma del cliente", () => {
    const n = staffNextAction(flow({ receptionSigned: false, actaPending: true }));
    expect(n.title).toBe("Falta la firma del cliente en el acta");
    expect(n.notice).toBeUndefined();
  });
  it("ticket ya en diagnóstico con el acta sin firmar: conserva su acción principal y AÑADE un aviso visible (sin contradecir)", () => {
    const n = staffNextAction(flow({ status: "diagnosing", receptionSigned: false, actaPending: true }));
    expect(n.title).toBe("Registrar el diagnóstico");
    expect(n.notice).toMatchObject({ title: "El acta de recepción sigue sin firma del cliente", anchor: "recepcion" });
    expect(n.notice?.body).toMatch(/No la firmes tú por él/);
  });
  it("sin aviso si el acta está firmada, si hay una excepción autorizada o si el ticket está cerrado", () => {
    expect(staffNextAction(flow({ status: "diagnosing", actaPending: false, receptionSigned: true })).notice).toBeUndefined();
    expect(staffNextAction(flow({ status: "diagnosing", actaPending: true, actaException: true, receptionSigned: true })).notice).toBeUndefined();
    expect(staffNextAction(flow({ status: "delivered", actaPending: true })).notice).toBeUndefined();
  });
});

import { backLabel, backTarget, clientDocHref } from "@/lib/navigation";

describe("navegación: siempre hay una salida clara y segura", () => {
  const fb = { href: "/c/documentos", label: "Volver a mis documentos" };
  it("regresa al contexto real desde el que se abrió (ticket, cotización, lista) con su texto", () => {
    expect(backTarget("/c/tickets/abc", fb)).toEqual({ href: "/c/tickets/abc", label: "Volver a mi servicio" });
    expect(backTarget("/c/tickets/abc/cotizacion", fb)).toEqual({ href: "/c/tickets/abc/cotizacion", label: "Volver a la cotización" });
    expect(backTarget("/b/tickets/abc", fb).label).toBe("Volver al ticket");
    expect(backTarget("/c/documentos", fb).label).toBe("Volver a mis documentos");
    expect(backLabel("/c")).toBe("Volver al inicio");
    expect(backLabel("/c/tickets/abc?pago=ok")).toBe("Volver a mi servicio");
  });
  it("sin contexto (enlace directo o pestaña nueva) usa el destino por defecto: no depende del historial del navegador", () => {
    expect(backTarget(undefined, fb)).toEqual(fb);
    expect(backTarget("", fb)).toEqual(fb);
  });
  it("rechaza destinos peligrosos (redirección abierta): otro dominio, doble barra, esquemas, rutas fuera de la app", () => {
    for (const bad of ["https://evil.example/x", "//evil.example/x", "javascript:alert(1)", "/\evil", "/api/secreto", "/login", "/c/../etc"]) expect(backTarget(bad, fb)).toEqual(fb);
  });
  it("el enlace a un documento desde un ticket conserva el origen codificado", () => {
    expect(clientDocHref("d1", "t9")).toBe("/c/documentos/d1?from=%2Fc%2Ftickets%2Ft9");
  });
});
