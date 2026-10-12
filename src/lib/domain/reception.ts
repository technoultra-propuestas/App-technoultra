export const ACCESSORIES = ["Cargador", "Estuche", "Mouse", "Cable USB", "Batería extra", "Otro"];
/** Daños visibles (casillas). «Otros daños» pide describirlos en el campo de texto de detalles. */
export const DAMAGES = ["Rayones", "Golpes", "Pantalla rota", "Bisagra floja", "Teclas faltantes", "Carcasa partida", "Otros daños"];

/**
 * Fotografías de recepción. Cada «vista» obligatoria se satisface con su fotografía principal o con una equivalente (las equivalentes
 * existen por compatibilidad con recepciones anteriores, que usaban pantalla y serial). La base de datos exige además el mínimo de fotos
 * (`reception.min_photos`) para pasar a diagnóstico: aquí se aplica la regla de las cuatro vistas.
 */
export type PhotoSlot = { slot: string; label: string; short: string; required: boolean; view?: number };
export const PHOTO_SLOTS: readonly PhotoSlot[] = [
  { slot: "front", label: "Vista frontal y pantalla", short: "Frontal y pantalla", required: true, view: 1 },
  { slot: "back", label: "Parte posterior o tapa", short: "Posterior o tapa", required: true, view: 2 },
  { slot: "left", label: "Laterales y puertos", short: "Laterales y puertos", required: true, view: 3 },
  { slot: "damage", label: "Daños visibles o vista adicional", short: "Daños o vista extra", required: true, view: 4 },
  { slot: "screen", label: "Pantalla", short: "Pantalla", required: false },
  { slot: "serial", label: "Serial", short: "Serial", required: false },
  { slot: "right", label: "Lateral derecho", short: "Lateral derecho", required: false },
  { slot: "charger", label: "Cargador", short: "Cargador", required: false },
  { slot: "other", label: "Otros", short: "Otros", required: false },
] as const;

/** Las cuatro vistas obligatorias y las fotos que las satisfacen (la principal primero). */
export const REQUIRED_VIEWS: { view: number; slots: string[] }[] = [
  { view: 1, slots: ["front", "screen"] },
  { view: 2, slots: ["back"] },
  { view: 3, slots: ["left", "right"] },
  { view: 4, slots: ["damage", "serial", "other"] },
];

export type PhotoStatus = { done: number; total: number; complete: boolean; missingViews: number[]; missingLabels: string[] };

/** Estado de las fotos de recepción a partir de las fotos (no eliminadas) ya registradas. */
export function receptionPhotoStatus(slots: (string | null)[]): PhotoStatus {
  const have = new Set(slots.filter((s): s is string => Boolean(s)));
  const missingViews = REQUIRED_VIEWS.filter((v) => !v.slots.some((s) => have.has(s))).map((v) => v.view);
  const label = (view: number) => PHOTO_SLOTS.find((p) => p.view === view)?.short ?? `Vista ${view}`;
  return {
    done: REQUIRED_VIEWS.length - missingViews.length,
    total: REQUIRED_VIEWS.length,
    complete: missingViews.length === 0,
    missingViews,
    missingLabels: missingViews.map(label),
  };
}

export const DIAGNOSTIC_COMPONENTS = [
  "Temperaturas",
  "Almacenamiento (SMART)",
  "Memoria RAM",
  "Batería",
  "Sistema operativo",
  "Malware",
  "Drivers",
] as const;
