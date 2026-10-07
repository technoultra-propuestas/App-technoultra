/** Qué significa cada estado para el cliente (texto estable, sin IA). La base de conocimiento puede ampliarlo, nunca contradecirlo. */
export const TICKET_STATUS_HELP: Record<string, { label: string; meaning: string }> = {
  received: { label: "Solicitud recibida", meaning: "Tu solicitud quedó registrada. Si el servicio requiere tu equipo, en tu ticket ves cómo coordinar la entrega; «Equipo recibido» solo aparece cuando ya lo tenemos." },
  diagnosing: { label: "En diagnóstico", meaning: "Un técnico está revisando tu equipo para identificar la causa." },
  awaiting_approval: { label: "Esperando aprobación", meaning: "Te enviamos una cotización y esperamos tu decisión. No hacemos nada sin tu aprobación." },
  awaiting_part: { label: "Esperando repuesto", meaning: "Esperamos la llegada del repuesto necesario; te avisaremos." },
  in_service: { label: "En servicio", meaning: "Estamos realizando el trabajo aprobado." },
  testing: { label: "En pruebas", meaning: "Estamos verificando que todo funcione antes de entregarte el equipo." },
  ready: { label: "Listo para entregar", meaning: "Tu equipo está listo; coordinaremos la entrega." },
  delivered: { label: "Entregado", meaning: "El equipo ya fue entregado; en tu ticket están el acta y la garantía." },
  cancelled: { label: "Cancelado", meaning: "El servicio se canceló y no continuará." },
};

export const PAYMENT_STATUS_HELP: Record<string, string> = {
  pending: "está pendiente de confirmación de Mercado Pago (no necesitas pagar de nuevo)",
  approved: "fue aprobado",
  rejected: "fue rechazado; puedes intentarlo de nuevo",
  cancelled: "fue cancelado",
  refunded: "fue reembolsado",
  expired: "venció sin completarse; puedes iniciar uno nuevo",
};

export const ORDER_STATUS_HELP: Record<string, string> = { new: "Nuevo", preparing: "Preparando", shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado" };
