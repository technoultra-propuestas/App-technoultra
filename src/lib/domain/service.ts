import { z } from "zod";
import { MODALITIES } from "@/lib/domain/requests";

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const num = (min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v.replace(/[^0-9.]/g, "")) : null))
    .pipe(z.number().min(min).max(max).nullable());
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));
const flag = z
  .string()
  .optional()
  .transform((v) => v === "on");

export const serviceSchema = z
  .object({
    name: z.string().trim().min(2, "Escribe el nombre.").max(120),
    slug: z.string().trim().max(80).optional(),
    kind: z.enum(["technical", "digital"]),
    categoryId: z.union([z.literal(""), z.string().uuid()]).optional(),
    subcategoryId: z.union([z.literal(""), z.string().uuid()]).optional(),
    shortDescription: text(200),
    description: text(4000),
    priceMode: z.enum(["fixed", "from", "quote"]),
    basePrice: num(0, 1_000_000_000),
    priceUnit: text(20),
    priceTypeLabel: text(40),
    partsExtra: flag,
    isDiagnosticFee: flag,
    includesText: text(1000),
    excludesText: text(1000),
    priceTreatment: text(1000),
    estimatedTime: text(60),
    modalityLabel: text(80),
    sortOrder: num(0, 100000),
    durationMinutes: num(5, 10080),
    modalities: z
      .array(z.enum(MODALITIES))
      .min(1, "Elige al menos una modalidad.")
      .or(z.enum(MODALITIES).transform((m) => [m])),
    requiresEquipment: flag,
    requiresDiagnosis: flag,
    requiresQuote: flag,
    warrantyDays: num(0, 3650),
    warrantyKind: z.enum(["product", "labor"]),
    seoTitle: text(70),
    seoDescription: text(170),
    isActive: flag,
  })
  .refine((v) => v.priceMode === "quote" || v.basePrice !== null, { message: "Indica el precio base.", path: ["basePrice"] });

export type ServiceInput = z.infer<typeof serviceSchema>;

/** FormData con checkboxes múltiples → objeto (los `modalities` se agrupan en arreglo). */
export function formToObject(fd: FormData): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const o: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const key of new Set(fd.keys())) {
    const all = fd.getAll(key);
    o[key] = key === "modalities" ? all : all[0];
  }
  return o;
}

export function toServiceRow(v: ServiceInput) {
  return {
    name: v.name,
    slug: slugify(v.slug || v.name),
    kind: v.kind,
    category_id: v.categoryId || null,
    subcategory_id: v.subcategoryId || null,
    short_description: v.shortDescription,
    description: v.description,
    price_mode: v.priceMode,
    base_price: v.priceMode === "quote" ? null : v.basePrice,
    price_unit: v.priceUnit,
    price_type_label: v.priceTypeLabel,
    parts_extra: v.partsExtra,
    is_diagnostic_fee: v.isDiagnosticFee,
    includes_text: v.includesText,
    excludes_text: v.excludesText,
    price_treatment: v.priceTreatment,
    estimated_time: v.estimatedTime,
    modality_label: v.modalityLabel,
    ...(v.sortOrder !== null ? { sort_order: v.sortOrder } : {}),
    duration_minutes: v.durationMinutes,
    allowed_modalities: v.modalities,
    requires_equipment: v.requiresEquipment,
    requires_diagnosis: v.requiresDiagnosis,
    requires_quote: v.requiresQuote,
    default_warranty_days: v.warrantyDays ?? 0,
    default_warranty_kind: v.warrantyKind,
    seo_title: v.seoTitle,
    seo_description: v.seoDescription,
    is_active: v.isActive,
  };
}
