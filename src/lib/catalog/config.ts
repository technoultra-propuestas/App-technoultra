/**
 * Configuración comercial del catálogo de productos de proveedor (Excelenter). Separada a propósito de los servicios técnicos:
 * los servicios usan `coverage_areas` / `app_settings`; los productos usan estas reglas y nunca se mezclan.
 */
export const CATALOG_SOURCE = "EXCELENTER";

/** Porcentaje que TechnoUltra suma sobre el precio fuente (ingreso comercial objetivo). Se aplica en la base de datos (`guard`/`sync_catalog`). */
export const MARKUP_PERCENT = 20;

/** WhatsApp de TechnoUltra (formato internacional sin «+», como exige wa.me). */
export const WHATSAPP_NUMBER = "573183943465";
export const WHATSAPP_DISPLAY = "+57 318 394 3465";

/** Domicilio de productos (INFORMATIVO: se confirma por WhatsApp; no se cobra en la app). */
export const PRODUCT_SHIPPING_CALI_URBAN = 10_000;
export const PRODUCT_SHIPPING_CALI_OUTSIDE = 20_000;
/** «Zonas aledañas» (definición del propietario): los municipios vecinos que cubre la tarifa de fuera del perímetro urbano de Cali. */
export const PRODUCT_SHIPPING_OUTSIDE_ZONES = ["Jamundí", "Palmira", "Yumbo", "Candelaria"] as const;
export const OUTSIDE_ZONES_TEXT = "Jamundí, Palmira, Yumbo y Candelaria";

/** Alerta si el precio fuente cambia más de este porcentaje en una sola sincronización (se aplica en la base de datos). */
export const PRICE_JUMP_ALERT_PERCENT = 20;

export const PAGE_SIZE = 24;
