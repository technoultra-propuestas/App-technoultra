import { z } from "zod";

export type SettingDef = { key: string; label: string; hint?: string; kind: "text" | "int"; min?: number; max?: number; isPublic: boolean; section: "Negocio (público)" | "Operación" };

/** Ajustes administrables sin tocar código. Los "públicos" alimentan los datos estructurados SEO (solo si se cargan). */
export const SETTINGS: SettingDef[] = [
  { key: "business.name", label: "Nombre del negocio", kind: "text", isPublic: true, section: "Negocio (público)" },
  { key: "business.phone", label: "Teléfono de contacto", kind: "text", isPublic: true, section: "Negocio (público)", hint: "Se publica en los datos estructurados (SEO) si lo completas." },
  { key: "business.email", label: "Correo de contacto", kind: "text", isPublic: true, section: "Negocio (público)" },
  { key: "business.address", label: "Dirección del local", kind: "text", isPublic: true, section: "Negocio (público)", hint: "Habilita el marcado LocalBusiness. Solo ingresa una dirección real." },
  { key: "maintenance.default_months", label: "Meses al próximo mantenimiento", kind: "int", min: 1, max: 36, isPublic: false, section: "Operación" },
  { key: "reception.min_photos", label: "Fotos mínimas de recepción", kind: "int", min: 0, max: 9, isPublic: false, section: "Operación" },
  { key: "quote.default_validity_days", label: "Vigencia de cotizaciones (días)", kind: "int", min: 1, max: 90, isPublic: false, section: "Operación" },
  { key: "orders.pending_hours", label: "Horas de reserva de un pedido sin pagar", kind: "int", min: 1, max: 168, isPublic: false, section: "Operación" },
];

export function parseSetting(def: SettingDef, raw: string): { ok: true; value: string | number } | { ok: false; error: string } {
  if (def.kind === "int") {
    const r = z.coerce.number().int("Usa un número entero.").min(def.min ?? 0, `Mínimo ${def.min}.`).max(def.max ?? 1_000_000, `Máximo ${def.max}.`).safeParse(raw.trim());
    return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error.issues[0]?.message ?? "Valor no válido." };
  }
  const t = raw.trim();
  if (t.length > 300) return { ok: false, error: "Máximo 300 caracteres." };
  if (def.key === "business.email" && t && !z.string().email().safeParse(t).success) return { ok: false, error: "Correo no válido." };
  if (def.key === "business.phone" && t && !/^\+?[0-9 ()-]{7,20}$/.test(t)) return { ok: false, error: "Teléfono no válido (solo números, espacios, + ( ) -)." };
  if (def.key === "business.name" && t && t.length < 2) return { ok: false, error: "Escribe al menos 2 caracteres." };
  if (def.key === "business.address" && t && t.length < 5) return { ok: false, error: "Escribe la dirección completa." };
  return { ok: true, value: t };
}
