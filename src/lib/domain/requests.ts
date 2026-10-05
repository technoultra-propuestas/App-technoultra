import { z } from "zod";

export const MODALITIES = ["store", "pickup", "home", "remote"] as const;
export const COVERAGE_MESSAGE =
  "Actualmente no tenemos cobertura para servicios presenciales en esta ciudad. Puedes solicitar asistencia remota si el servicio lo permite.";

export const requestSchema = z.object({
  serviceId: z.string().uuid("Servicio no válido."),
  modality: z.enum(MODALITIES, { message: "Elige cómo quieres el servicio." }),
  equipmentId: z.union([z.literal(""), z.string().uuid()]).optional(),
  addressId: z.union([z.literal(""), z.string().uuid()]).optional(),
  problem: z.string().trim().min(5, "Cuéntanos qué pasa (mínimo 5 caracteres).").max(2000),
  day: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  slot: z.enum(["morning", "afternoon"]).optional(),
});
export type RequestInput = z.infer<typeof requestSchema>;

/** Días hábiles (lunes–sábado) a partir de mañana, en la zona horaria de Colombia. */
export function nextBusinessDays(count: number, from: Date = new Date()): string[] {
  const out: string[] = [];
  const bogota = new Date(from.getTime() - 5 * 3600_000); // UTC-5 sin horario de verano
  const d = new Date(Date.UTC(bogota.getUTCFullYear(), bogota.getUTCMonth(), bogota.getUTCDate()));
  while (out.length < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Convierte día + franja a un instante (UTC-5). Valida que el día esté entre los próximos días hábiles
 * disponibles: el navegador no puede fijar una fecha arbitraria.
 */
export function toPreferredAt(
  day: string | undefined,
  slot: "morning" | "afternoon" | undefined,
  now: Date = new Date(),
): string | null {
  if (!day) return null;
  if (!nextBusinessDays(14, now).includes(day)) return null;
  return `${day}T${slot === "afternoon" ? "14" : "09"}:00:00-05:00`;
}

const ERROR_MAP: [RegExp, string][] = [
  [/out_of_coverage/, COVERAGE_MESSAGE],
  [/address_required/, "Elige o agrega la dirección donde se prestará el servicio."],
  [/address_not_owned/, "La dirección elegida no es válida."],
  [/equipment_required/, "Elige el equipo para este servicio."],
  [/equipment_not_owned/, "El equipo elegido no es válido."],
  [/modality_not_allowed/, "Ese servicio no está disponible en la modalidad elegida."],
  [/service_unavailable/, "Ese servicio no está disponible por ahora."],
];
/** Traduce errores de la base de datos a mensajes comprensibles (nunca se muestra el texto técnico). */
export function friendlyRequestError(message: string | undefined): string {
  for (const [re, text] of ERROR_MAP) if (message && re.test(message)) return text;
  return "No pudimos crear tu solicitud. Inténtalo de nuevo.";
}
