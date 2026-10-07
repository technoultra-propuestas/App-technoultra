/**
 * Estado del servicio tal como lo ve una persona. «Recibido» NUNCA se refiere al dinero ni a la solicitud: significa que TechnoUltra
 * tiene físicamente el equipo. El estado técnico de la base de datos no cambia (`received` sigue siendo el estado inicial del ticket);
 * lo que cambia es cómo se interpreta: sin acta de recepción es «Solicitud recibida»; con acta, «Equipo recibido».
 * Pago y estado físico del equipo son dimensiones separadas.
 */
export type TicketStatus = "received" | "diagnosing" | "awaiting_approval" | "awaiting_part" | "in_service" | "testing" | "ready" | "delivered" | "cancelled";
export type Modality = "store" | "pickup" | "home" | "remote";

/** Estado para mostrar: separa «Solicitud recibida» (sin equipo) de «Equipo recibido» (con acta de recepción). */
export type DisplayStatus = TicketStatus | "requested" | "equipment_received";
export function effectiveStatus(status: string, equipmentReceived: boolean, modality?: string): DisplayStatus {
  if (status !== "received") return status as TicketStatus;
  // Servicios remotos no tienen equipo físico: nunca dicen «Equipo recibido».
  if (modality === "remote") return "requested";
  return equipmentReceived ? "equipment_received" : "requested";
}

export const DISPLAY_LABEL: Record<DisplayStatus, string> = {
  requested: "Solicitud recibida",
  equipment_received: "Equipo recibido",
  received: "Solicitud recibida",
  diagnosing: "En diagnóstico",
  awaiting_approval: "Esperando tu aprobación",
  awaiting_part: "Esperando repuesto",
  in_service: "En servicio",
  testing: "En pruebas",
  ready: "Listo para entregar",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const PHYSICAL_STEPS = ["Solicitud", "Equipo recibido", "Diagnóstico", "Aprobación", "Servicio", "Entrega"];
const REMOTE_STEPS = ["Solicitud", "Diagnóstico", "Aprobación", "Servicio", "Cierre"];

/** Pasos del avance y cuál es el actual. `current === steps.length` significa «todo completado». Cancelado no tiene avance. */
export function progressSteps(status: string, equipmentReceived: boolean, modality: string): { steps: string[]; current: number } | null {
  if (status === "cancelled") return null;
  const remote = modality === "remote";
  const steps = remote ? REMOTE_STEPS : PHYSICAL_STEPS;
  const off = remote ? 0 : 1; // los pasos siguientes al de equipo se desplazan en servicios remotos
  let current: number;
  switch (status) {
    case "received":
      current = remote ? 0 : equipmentReceived ? 1 : 0;
      break;
    case "diagnosing":
      current = 1 + off;
      break;
    case "awaiting_approval":
      current = 2 + off;
      break;
    case "awaiting_part":
    case "in_service":
    case "testing":
      current = 3 + off;
      break;
    case "ready":
      current = 4 + off;
      break;
    case "delivered":
      current = steps.length;
      break;
    default:
      current = 0;
  }
  return { steps, current };
}

/** Dónde está el equipo y qué sigue, según el estado y la modalidad (sin mezclar con el pago). */
export function equipmentWhere(status: string, equipmentReceived: boolean, modality: string): string {
  if (status === "cancelled") return "Este servicio fue cancelado.";
  if (modality === "remote") return "No necesitas entregar físicamente el equipo.";
  if (status === "delivered") return "Tu equipo ya fue entregado.";
  if (status === "ready") return "Tu equipo está listo. Coordinaremos contigo la entrega.";
  if (status === "received" && !equipmentReceived) {
    if (modality === "pickup") return "Coordinaremos contigo la recogida del equipo en la dirección indicada.";
    if (modality === "home") return "Nuestro técnico se pondrá en contacto contigo para coordinar la visita.";
    return "Aún no tenemos tu equipo. Puedes entregarlo en el punto acordado.";
  }
  return "Tu equipo está con TechnoUltra.";
}

/** Mensaje que ve la persona cuando el pago ya quedó confirmado, según la modalidad elegida. */
export function paidNextStep(modality: string): string {
  const base = "Tu solicitud está en proceso. Nuestro equipo se pondrá en contacto contigo";
  switch (modality) {
    case "home":
      return `${base} para coordinar la visita a la dirección indicada.`;
    case "pickup":
      return `${base} para coordinar la recogida del equipo.`;
    case "store":
      return "Tu solicitud está en proceso. Te indicaremos cuándo puedes llevar el equipo.";
    case "remote":
      return `${base} para iniciar el soporte remoto; no necesitas entregar el equipo.`;
    default:
      return `${base}.`;
  }
}

/** Mensaje principal del ticket para el cliente. */
export function ticketMessage(status: DisplayStatus, modality: string): string {
  switch (status) {
    case "requested":
    case "received":
      return modality === "remote" ? "Recibimos tu solicitud. Un técnico te contactará para el soporte remoto." : "Recibimos tu solicitud. Todavía no tenemos tu equipo: te contamos abajo cómo coordinarlo.";
    case "equipment_received":
      return "Ya tenemos tu equipo. Pronto empieza la revisión.";
    case "diagnosing":
      return "Un técnico está revisando tu equipo para confirmar qué necesita.";
    case "awaiting_approval":
      return "Revisa la cotización. No hacemos ningún trabajo sin tu aprobación.";
    case "awaiting_part":
      return "Estamos esperando un repuesto para continuar.";
    case "in_service":
      return "Estamos trabajando en tu equipo.";
    case "testing":
      return "Estamos probando que todo funcione bien.";
    case "ready":
      return "Tu equipo está listo. Coordinemos la entrega.";
    case "delivered":
      return "Servicio finalizado. Tu garantía ya está activa.";
    case "cancelled":
      return "Este servicio fue cancelado.";
  }
}
