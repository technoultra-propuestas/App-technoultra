/**
 * «Próxima acción» del PERSONAL y «Ahora estamos aquí» del CLIENTE. Se derivan solo de hechos verificados en el servidor
 * (estado del ticket, acta de recepción, diagnóstico, cotización, pagos): ninguna decisión depende del navegador. Cada pantalla
 * muestra UNA acción principal; lo demás queda como contexto.
 */
export type FlowFacts = {
  status: string;
  modality: string;
  hasReception: boolean;
  photosComplete: boolean;
  hasDiagnosis: boolean;
  diagnosisFinalized: boolean;
  quoteStatus: string | null; // draft | sent | clarification | approved | rejected | expired | null
  quoteItems: number;
  /** Pago del concepto actual: confirmed | validating | none | not_required. */
  payment: "confirmed" | "validating" | "none" | "not_required";
  /** Hay un pago de cotización pendiente de cobrar (cotización aprobada y no pagada). */
  quotePayable: boolean;
  checklistDone: boolean;
  hasChecklist: boolean;
  hasDelivery: boolean;
};

export type StaffNext = {
  title: string;
  body: string;
  /** Ancla de la sección donde se ejecuta la acción (la pantalla del ticket ya la contiene). */
  cta?: { label: string; anchor: string };
  waiting: boolean;
};

export function staffNextAction(f: FlowFacts): StaffNext {
  const physical = f.modality !== "remote";
  switch (f.status) {
    case "cancelled":
      return { title: "Servicio cancelado", body: "No hay acciones pendientes en este ticket.", waiting: true };
    case "delivered":
      return { title: "Servicio entregado", body: "El ticket está cerrado. La garantía ya está activa.", waiting: true };
    case "received":
      if (physical && !f.hasReception) return { title: "Recibir el equipo", body: f.payment === "none" ? "Cuando llegue el equipo, registra la recepción con sus fotos. El pago del diagnóstico sigue pendiente." : "Cuando llegue el equipo, registra la recepción con sus fotos: el ticket pasa solo a diagnóstico.", cta: { label: "Registrar recepción", anchor: "recepcion" }, waiting: false };
      if (physical && !f.photosComplete) return { title: "Completa las fotos de recepción", body: "Faltan fotos obligatorias. Al completarlas el ticket pasa solo a diagnóstico.", cta: { label: "Subir fotos", anchor: "recepcion" }, waiting: false };
      return { title: physical ? "Pasar a diagnóstico" : "Iniciar el soporte remoto", body: "Cambia el estado a «En diagnóstico» para empezar.", cta: { label: "Cambiar estado", anchor: "estado" }, waiting: false };
    case "diagnosing":
      if (!f.hasDiagnosis) return { title: "Registrar el diagnóstico", body: "Anota los hallazgos y pruebas. Después lo finalizas y el sistema prepara la propuesta.", cta: { label: "Escribir diagnóstico", anchor: "diagnostico" }, waiting: false };
      if (!f.diagnosisFinalized) return { title: "Finalizar el diagnóstico", body: "Revísalo y finalízalo: se genera el informe en PDF para el cliente y la propuesta de cotización.", cta: { label: "Finalizar diagnóstico", anchor: "diagnostico" }, waiting: false };
      if (!f.quoteStatus) return { title: "Generar la propuesta", body: "El sistema ya preparó los servicios sugeridos. Revísalos y úsalos para crear la cotización.", cta: { label: "Revisar propuesta", anchor: "cotizacion" }, waiting: false };
      return { title: "Revisar y enviar la cotización", body: f.quoteItems ? "La cotización está lista. Revisa los conceptos y envíala al cliente." : "Agrega al menos un concepto antes de enviarla.", cta: { label: "Ver cotización", anchor: "cotizacion" }, waiting: false };
    case "awaiting_approval":
      if (f.quoteStatus === "clarification") return { title: "El cliente tiene una pregunta", body: "Respóndele para que pueda decidir.", cta: { label: "Responder", anchor: "cotizacion" }, waiting: false };
      return { title: "Esperando aprobación del cliente", body: "La cotización fue enviada. No hay nada más que hacer hasta que el cliente decida.", cta: { label: "Ver cotización", anchor: "cotizacion" }, waiting: true };
    case "awaiting_part":
      return { title: "Esperando repuesto", body: "Cuando llegue el repuesto, inicia el servicio.", cta: { label: "Cambiar estado", anchor: "estado" }, waiting: false };
    case "in_service":
      return { title: "Realizar el servicio", body: f.quotePayable ? "El cliente aún no ha pagado el saldo de la cotización. Cuando termines, pasa a pruebas." : "Cuando termines, pasa el ticket a pruebas.", cta: { label: "Pasar a pruebas", anchor: "estado" }, waiting: false };
    case "testing":
      if (!f.hasChecklist || !f.checklistDone) return { title: "Completar las pruebas", body: "Inicia el checklist y resuelve las pruebas obligatorias. No se marca «Listo» sin pruebas.", cta: { label: "Ir al checklist", anchor: "pruebas" }, waiting: false };
      return { title: "Marcar como listo", body: "Las pruebas están completas. Pasa el ticket a «Listo para entregar».", cta: { label: "Cambiar estado", anchor: "estado" }, waiting: false };
    case "ready":
      return f.hasDelivery
        ? { title: "Entregar el equipo", body: "La entrega está registrada. Pasa el ticket a «Entregado».", cta: { label: "Cambiar estado", anchor: "estado" }, waiting: false }
        : { title: "Registrar la entrega", body: "Sube las fotos de entrega y registra quién recibe el equipo.", cta: { label: "Registrar entrega", anchor: "entrega" }, waiting: false };
    default:
      return { title: "Revisar el ticket", body: "Revisa el estado y continúa.", waiting: false };
  }
}

export type ClientNext = {
  title: string;
  body: string;
  /** Una sola acción principal. `href` relativo dentro de la app (o ancla). */
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  tone: "action" | "wait" | "done";
};

export type ClientFacts = FlowFacts & {
  ticketId: string;
  /** Existe el PDF del diagnóstico / de la cotización para abrir en el visor. */
  diagnosisDocId: string | null;
  quoteDocId: string | null;
  /** Falta cobrar el diagnóstico (servicio de diagnóstico sin pago confirmado). */
  diagnosisPayable: boolean;
  /** Enlace para coordinar la entrega (WhatsApp de TechnoUltra con el código del ticket). Si no hay, no se muestra el botón. */
  deliveryHref?: string;
};

export function clientNextAction(f: ClientFacts): ClientNext {
  const base = `/c/tickets/${f.ticketId}`;
  if (f.status === "cancelled") return { title: "Servicio cancelado", body: "Este servicio fue cancelado.", tone: "done" };
  if (f.status === "delivered") return { title: "Servicio finalizado", body: "Tu equipo fue entregado y tu garantía ya está activa.", tone: "done" };
  if (f.diagnosisPayable && f.payment === "none") return { title: "Falta el pago del diagnóstico", body: "Paga el diagnóstico para que podamos empezar.", primary: { label: "Pagar", href: "#pago" }, tone: "action" };
  if (f.payment === "validating") return { title: "Estamos validando tu pago", body: "Te avisaremos cuando quede confirmado. No necesitas hacer nada más.", tone: "wait" };
  switch (f.status) {
    case "received": {
      if (f.modality === "remote") return { title: "Un técnico te contactará", body: "Es soporte remoto: no necesitas entregar tu equipo.", tone: "wait" };
      if (!f.hasReception) {
        const how = f.modality === "pickup" ? "Nuestro equipo coordinará contigo la recogida del equipo en la dirección indicada." : f.modality === "home" ? "Nuestro técnico se pondrá en contacto contigo para coordinar la visita." : "Puedes entregar el equipo en el punto acordado.";
        return { title: "Pendiente de recibir tu equipo", body: `Cuando recibamos tu equipo podremos iniciar el diagnóstico. ${how}`, tone: "wait" };
      }
      return { title: "Ya tenemos tu equipo", body: "Pronto empieza la revisión.", tone: "wait" };
    }
    case "diagnosing":
      return f.diagnosisFinalized && f.diagnosisDocId
        ? { title: "Diagnóstico listo", body: "Ya tenemos el resultado de la revisión de tu equipo.", primary: { label: "Ver diagnóstico", href: `/c/documentos/${f.diagnosisDocId}` }, tone: "action" }
        : { title: "Tu equipo está en diagnóstico", body: "Estamos revisándolo para identificar la causa del problema.", tone: "wait" };
    case "awaiting_approval":
      return f.quoteDocId || f.quoteStatus
        ? { title: "Tenemos una propuesta para ti", body: "Incluye reparación, mano de obra y repuestos. No hacemos ningún trabajo sin tu aprobación.", primary: { label: "Ver cotización", href: `${base}/cotizacion` }, secondary: f.diagnosisDocId ? { label: "Ver diagnóstico", href: `/c/documentos/${f.diagnosisDocId}` } : undefined, tone: "action" }
        : { title: "Estamos preparando tu cotización", body: "Te avisaremos apenas esté lista.", tone: "wait" };
    case "awaiting_part":
      return { title: "Esperando un repuesto", body: "Aprobaste la cotización. Continuamos cuando llegue el repuesto.", tone: "wait" };
    case "in_service":
      return f.quotePayable
        ? { title: "Falta el pago del saldo", body: "Tu cotización está aprobada. Paga el saldo para que podamos entregarte el equipo.", primary: { label: "Pagar", href: "#pago" }, tone: "action" }
        : { title: "Estamos trabajando en tu equipo", body: "Te avisaremos cuando pase a pruebas.", tone: "wait" };
    case "testing":
      return { title: "Estamos probando tu equipo", body: "Verificamos que todo funcione bien antes de entregarlo.", tone: "wait" };
    case "ready":
      return { title: "Tu equipo está listo", body: "Coordinemos la entrega. Nos pondremos en contacto contigo.", primary: f.deliveryHref ? { label: "Coordinar entrega", href: f.deliveryHref } : undefined, tone: f.deliveryHref ? "action" : "wait" };
    default:
      return { title: "Estamos con tu solicitud", body: "Te mantendremos informado.", tone: "wait" };
  }
}
