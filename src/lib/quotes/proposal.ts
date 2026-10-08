/**
 * Propuesta automática de cotización. DETERMINISTA y explicable: la IA y el técnico aportan TEXTO (síntomas, diagnóstico,
 * recomendaciones); aquí solo se traduce a servicios REALES del catálogo con su precio de catálogo.
 *
 *   · No se inventa ningún servicio, precio, repuesto ni compatibilidad: si una necesidad no tiene un servicio equivalente en el
 *     catálogo, queda como «Requiere revisión» y NO suma al total.
 *   · «Desde …» y «a cotizar» siempre se marcan como «Requiere revisión» (el valor final lo confirma el técnico).
 *   · La propuesta solo se PREPARA: el técnico la valida (quita, agrega, modifica) y recién entonces se genera la cotización.
 */
export type CatalogService = {
  id: string;
  name: string;
  price_mode: "fixed" | "from" | "quote";
  base_price: number | null;
  is_diagnostic_fee?: boolean | null;
};

export type Priority = "required" | "recommended" | "optional";
export const PRIORITY_LABEL: Record<Priority, string> = { required: "Necesario", recommended: "Recomendado", optional: "Opcional" };

type NeedRule = { id: string; label: string; test: RegExp; services: { pattern: RegExp; priority: Priority; what: string }[] };

export const NEED_RULES: NeedRule[] = [
  {
    id: "heat",
    label: "Sobrecalentamiento",
    test: /calient|sobrecalent|temperatura|ventilador|pasta t[eé]rmica|se apaga solo|throttl/i,
    services: [
      { pattern: /limpieza/i, priority: "required", what: "Limpieza profunda" },
      { pattern: /pasta t[eé]rmica/i, priority: "recommended", what: "Cambio de pasta térmica" },
    ],
  },
  {
    id: "slow",
    label: "Lentitud",
    test: /lent[oa]|tarda(?:n)? en|se (?:congela|traba|pega)|optimiz/i,
    services: [{ pattern: /optimiz|mantenimiento|formate/i, priority: "recommended", what: "Optimización del sistema" }],
  },
  {
    id: "malware",
    label: "Virus o programas no deseados",
    test: /virus|malware|spyware|publicidad|ventanas emergentes|troyano/i,
    services: [{ pattern: /virus|antivirus|malware|seguridad|limpieza de software/i, priority: "required", what: "Limpieza de virus" }],
  },
  {
    id: "os",
    label: "Sistema operativo",
    test: /windows|sistema operativo|formate|pantalla azul|no (?:arranca|inicia|carga)/i,
    services: [{ pattern: /formate|instalaci[oó]n de (?:windows|sistema)|sistema operativo|reinstalaci/i, priority: "required", what: "Reinstalación del sistema operativo" }],
  },
  {
    id: "power",
    label: "No enciende / energía",
    test: /no enciende|no prende|fuente de poder|cortocircuito|se reinicia solo/i,
    services: [{ pattern: /fuente|electr[oó]nic|reparaci[oó]n de (?:placa|tarjeta)/i, priority: "required", what: "Reparación de energía / fuente" }],
  },
  {
    id: "storage",
    label: "Almacenamiento",
    test: /disco (?:lleno|duro|da[nñ]ado)|ssd|hdd|almacenamiento|sin espacio/i,
    services: [{ pattern: /ssd|disco|clonaci/i, priority: "recommended", what: "Instalación o cambio de disco" }],
  },
  {
    id: "network",
    label: "Red / conexión",
    test: /internet|wifi|wi-fi|\bred\b|router|sin conexi[oó]n/i,
    services: [{ pattern: /\bred\b|wifi|router|conectividad/i, priority: "recommended", what: "Configuración de red" }],
  },
  {
    id: "printer",
    label: "Impresora",
    test: /impresora|no imprime|atasco|cabezal|tinta/i,
    services: [{ pattern: /impresora|cabezal/i, priority: "required", what: "Mantenimiento de impresora" }],
  },
  {
    id: "screen",
    label: "Pantalla",
    test: /pantalla (?:rota|partida|quebrada|da[nñ]ada)|no da imagen|l[ií]neas en la pantalla/i,
    services: [{ pattern: /pantalla/i, priority: "required", what: "Cambio de pantalla" }],
  },
  {
    id: "keyboard",
    label: "Teclado",
    test: /teclado|teclas/i,
    services: [{ pattern: /teclado/i, priority: "recommended", what: "Cambio de teclado" }],
  },
  {
    id: "battery",
    label: "Batería / carga",
    test: /bater[ií]a|no carga|cargador|puerto de carga/i,
    services: [{ pattern: /bater[ií]a|cargador|puerto de carga/i, priority: "recommended", what: "Cambio de batería o cargador" }],
  },
];

export type ProposalLine = {
  /** Identificador estable = id del servicio de catálogo (el navegador solo devuelve estos ids; el precio lo vuelve a leer el servidor). */
  key: string;
  serviceId: string;
  ruleId: string;
  name: string;
  /** Precio de catálogo; null si el servicio es «a cotizar». */
  unitPrice: number | null;
  concept: "labor";
  priority: Priority;
  reason: string;
  /** true = el técnico debe confirmar el valor antes de cotizar (servicios «Desde» o «a cotizar»). */
  review: boolean;
  reviewWhy?: string;
};
export type UnmatchedNeed = { ruleId: string; what: string; why: string };
export type Proposal = { lines: ProposalLine[]; unmatched: UnmatchedNeed[]; needs: string[] };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function buildProposal(text: string, services: CatalogService[]): Proposal {
  const t = norm(text);
  const lines: ProposalLine[] = [];
  const unmatched: UnmatchedNeed[] = [];
  const needs: string[] = [];
  const seen = new Set<string>();
  const sellable = services.filter((s) => !s.is_diagnostic_fee);
  for (const rule of NEED_RULES) {
    if (!rule.test.test(text) && !rule.test.test(t)) continue;
    needs.push(rule.label);
    for (const want of rule.services) {
      const svc = sellable.find((s) => want.pattern.test(s.name) || want.pattern.test(norm(s.name)));
      if (!svc) {
        unmatched.push({ ruleId: rule.id, what: want.what, why: `No hay un servicio «${want.what.toLowerCase()}» en el catálogo: agrégalo a mano o crea el servicio.` });
        continue;
      }
      if (seen.has(svc.id)) continue;
      seen.add(svc.id);
      const priced = svc.price_mode !== "quote" && svc.base_price !== null;
      lines.push({
        key: svc.id,
        serviceId: svc.id,
        ruleId: rule.id,
        name: svc.name,
        unitPrice: priced ? Number(svc.base_price) : null,
        concept: "labor",
        priority: want.priority,
        reason: `Detectamos: ${rule.label.toLowerCase()}.`,
        review: svc.price_mode !== "fixed",
        reviewWhy: svc.price_mode === "from" ? "Precio «desde»: confirma el valor final." : svc.price_mode === "quote" ? "Servicio a cotizar: define el valor." : undefined,
      });
    }
  }
  const order: Record<Priority, number> = { required: 0, recommended: 1, optional: 2 };
  lines.sort((a, b) => order[a.priority] - order[b.priority]);
  return { lines, unmatched, needs };
}

/** Subtotal de las líneas con precio de catálogo (las de «Requiere revisión» sin precio no suman). */
export function proposalSubtotal(lines: Pick<ProposalLine, "unitPrice">[]): number {
  return lines.reduce((s, l) => s + (l.unitPrice ?? 0), 0);
}
