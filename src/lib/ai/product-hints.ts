/**
 * Productos del Shop que «podrían ayudar» según los síntomas. Es DETERMINISTA (reglas explícitas síntoma → subcategoría del catálogo):
 * la IA no elige productos ni afirma compatibilidad. Solo se sugiere cuando el texto del cliente (o la causa detectada) menciona el síntoma,
 * y siempre se añade «Conviene verificar compatibilidad antes de comprar».
 */
export type ProductHintRule = { id: string; match: RegExp; subcategories: string[]; reason: string };

export const PRODUCT_HINT_RULES: ProductHintRule[] = [
  {
    id: "storage",
    match: /(muy |mucho )?lent[oa]|tarda(?:n)? en (?:prender|arrancar|iniciar|abrir)|disco (?:lleno|duro)|sin espacio|almacenamiento|hdd|ssd/i,
    subcategories: ["SSD SATA"],
    reason: "Si el equipo es lento al arrancar o abrir programas, un SSD suele mejorar mucho esos tiempos.",
  },
  {
    id: "heat",
    match: /calient|sobrecalent|temperatura|ventilador|ruido(?:so)? de ventilador|pasta t[eé]rmica|se apaga solo/i,
    subcategories: ["Kit limpiador y pasta térmica", "Accesorios para portátil", "Refrigeración líquida"],
    reason: "El exceso de calor se trata con limpieza y pasta térmica; en portátiles, una base refrigerante ayuda a ventilar.",
  },
  {
    id: "power",
    match: /fuente de poder|no enciende|no prende|bajones? de (?:luz|voltaje)|cortes? de (?:luz|energ)|apagones?|se reinicia solo/i,
    subcategories: ["Fuentes de Poder", "Reguladores", "UPS"],
    reason: "Si el equipo no enciende o se reinicia, puede ser la fuente de poder o la calidad de la energía (regulador o UPS).",
  },
  {
    id: "network",
    match: /internet|wifi|wi-fi|red\b|sin conexi[oó]n|router|cable de red|ethernet/i,
    subcategories: ["Convertidores", "Switches"],
    reason: "Para problemas de conexión por cable puede servir un adaptador de red o un switch.",
  },
  {
    id: "input",
    match: /teclado|mouse|rat[oó]n|no responde(?:n)? las teclas/i,
    subcategories: ["Teclados", "Mouse", "Combos teclado y mouse"],
    reason: "Si el teclado o el mouse fallan, reemplazarlos suele ser más rápido que repararlos.",
  },
  {
    id: "usb",
    match: /usb|puertos?|memoria usb|no reconoce (?:la )?(?:memoria|disco)/i,
    subcategories: ["Memorias USB", "Discos externos", "Adaptadores"],
    reason: "Para ampliar puertos o respaldar tu información puedes apoyarte en memorias, discos externos o adaptadores.",
  },
];

/** Reglas que aplican al texto del cliente y a las causas detectadas. Si ninguna aplica, no se sugiere nada (no se inventa relación). */
export function matchHintRules(problem: string, causes: string[] = []): ProductHintRule[] {
  const text = `${problem}\n${causes.join("\n")}`;
  return PRODUCT_HINT_RULES.filter((r) => r.match.test(text));
}

export const COMPATIBILITY_NOTE = "Conviene verificar compatibilidad antes de comprar.";
