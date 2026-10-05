import { z } from "zod";

export const EQUIPMENT_TYPES = ["laptop", "desktop", "all_in_one", "printer", "network", "other"] as const;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const equipmentSchema = z.object({
  type: z.enum(EQUIPMENT_TYPES, { message: "Elige el tipo de equipo." }),
  brand: z.string().trim().min(1, "Escribe la marca.").max(60),
  model: z.string().trim().min(1, "Escribe el modelo.").max(80),
  serial: optional(60),
  ram: optional(30),
  storage: optional(40),
  year: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(
      z
        .number()
        .int()
        .min(1990, "Año no válido.")
        .max(new Date().getFullYear() + 1, "Año no válido.")
        .nullable(),
    ),
  notes: optional(500),
});
export type EquipmentInput = z.infer<typeof equipmentSchema>;
