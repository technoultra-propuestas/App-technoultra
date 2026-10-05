export const ACCESSORIES = ["Cargador", "Estuche", "Mouse", "Cable USB", "Batería extra", "Otro"];
export const DAMAGES = ["Rayones", "Golpes", "Pantalla rota", "Teclas faltantes", "Bisagra floja", "Carcasa partida"];

/** Fotos de recepción: las cuatro primeras son obligatorias (la regla real la aplica la base de datos al pasar a diagnóstico). */
export const PHOTO_SLOTS = [
  { slot: "front", label: "Frontal", required: true },
  { slot: "back", label: "Posterior", required: true },
  { slot: "screen", label: "Pantalla", required: true },
  { slot: "serial", label: "Serial", required: true },
  { slot: "left", label: "Lateral izquierdo", required: false },
  { slot: "right", label: "Lateral derecho", required: false },
  { slot: "charger", label: "Cargador", required: false },
  { slot: "damage", label: "Daños", required: false },
  { slot: "other", label: "Otros", required: false },
] as const;
