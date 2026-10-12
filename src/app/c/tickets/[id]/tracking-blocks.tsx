import Link from "next/link";
import { Accordion, AccordionRow } from "@/components/ui/accordion";
import { IconAlert, IconCard, IconCheck, IconClock, IconDoc, IconGear, IconLaptop, IconPackage, IconShieldCheck, IconTool } from "@/components/ui/icons";
import { fmtDateTime, MODALITY_LABEL, money, statusLabel } from "@/components/ui/layout";
import { equipmentWhere } from "@/lib/domain/ticket-flow";

/**
 * Bloques INFERIORES del seguimiento del cliente. La línea de tiempo superior (ServiceTimeline) NO se toca: estos bloques tienen
 * componentes y estilos propios. Todo se deriva de hechos ya leídos en el servidor (estado del ticket, pagos, recepción, diagnóstico,
 * cotización, historial); no hay estados inventados.
 */

export type ProgressFacts = {
  status: string;
  modality: string;
  requestAt: string;
  pay: "confirmed" | "validating" | "failed" | "none" | "not_required";
  payAt: string | null;
  receptionAt: string | null;
  diagnosisAt: string | null;
  diagnosisDocId: string | null;
  quoteStatus: string | null;
  quoteDocId: string | null;
  repairDoneAt: string | null;
  deliveredAt: string | null;
  balanceDue: number;
  ticketId: string;
};

const when = (iso: string | null) => (iso ? `Cuándo: ${fmtDateTime(iso)}.` : null);
const IN_REPAIR = ["in_service", "awaiting_part", "testing"];

function Detail({ what, at, todo, link }: { what: string; at?: string | null; todo?: string | null; link?: { href: string; label: string } | null }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0">{what}</p>
      {at ? <p className="m-0 text-muted">{at}</p> : null}
      <p className="m-0 font-bold text-ink">{todo ?? "No necesitas hacer nada por ahora."}</p>
      {link ? (
        <Link href={link.href} className="w-fit text-[13.5px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">
          {link.label}
        </Link>
      ) : null}
    </div>
  );
}

/** «¿Cómo va tu servicio?»: una fila por aspecto, con ícono y estado breve; al desplegarla, qué pasó, cuándo y qué debes hacer. */
export function ServiceProgress({ f }: { f: ProgressFacts }) {
  const remote = f.modality === "remote";
  const cancelled = f.status === "cancelled";
  const base = `/c/tickets/${f.ticketId}`;
  const quoteValue = f.quoteStatus === "approved" ? "Aprobada" : f.quoteStatus === "rejected" ? "Rechazada" : f.quoteStatus === "clarification" ? "Pregunta enviada" : f.quoteStatus === "sent" ? "Disponible para revisar" : "Pendiente";
  return (
    <section aria-label="¿Cómo va tu servicio?" className="flex flex-col gap-1 rounded-card border border-line bg-white p-5 shadow-card">
      <h2 className="m-0 text-[17px] font-extrabold tracking-[-0.01em]">¿Cómo va tu servicio?</h2>
      <p className="m-0 text-[13px] text-muted">Toca cada línea para ver el detalle. El pago no cambia el estado de tu equipo.</p>
      <ul className="m-0 mt-1 flex list-none flex-col divide-y divide-line p-0">
        <AccordionRow icon={<IconDoc width={18} height={18} />} label="Solicitud" value="Registrada" tone="ok">
          <Detail what="Recibimos tu solicitud y la registramos con tu número de servicio." at={when(f.requestAt)} />
        </AccordionRow>
        {f.pay !== "not_required" ? (
          <AccordionRow
            icon={<IconCard width={18} height={18} />}
            label="Pago"
            value={f.pay === "confirmed" ? "Confirmado" : f.pay === "validating" ? "En validación" : f.pay === "failed" ? "No completado" : "Pendiente"}
            tone={f.pay === "confirmed" ? "ok" : f.pay === "validating" ? "wait" : f.pay === "failed" ? "bad" : "neutral"}
          >
            <Detail
              what={f.pay === "confirmed" ? "Tu pago está confirmado." : f.pay === "validating" ? "Estamos confirmando tu pago con la plataforma de pago." : f.pay === "failed" ? "El último intento de pago no se completó." : "Todavía no hay un pago registrado."}
              at={f.pay === "confirmed" ? when(f.payAt) : null}
              todo={f.pay === "validating" ? "No vuelvas a pagar mientras verificamos." : f.pay === "failed" || f.pay === "none" ? "Puedes pagar desde la sección «Pago» de esta pantalla." : null}
            />
          </AccordionRow>
        ) : null}
        <AccordionRow
          icon={<IconLaptop width={18} height={18} />}
          label="Equipo"
          value={equipmentWhere(f.status, Boolean(f.receptionAt), f.modality)}
          tone={remote || f.receptionAt || ["ready", "delivered"].includes(f.status) ? "ok" : cancelled ? "neutral" : "wait"}
        >
          <Detail
            what={remote ? "Es soporte remoto: trabajamos sin que entregues el equipo." : f.receptionAt ? "TechnoUltra tiene físicamente tu equipo; quedó registrada el acta de recepción con fotos." : "Aún no tenemos tu equipo."}
            at={when(f.receptionAt)}
            todo={remote || f.receptionAt || cancelled ? null : f.modality === "store" ? "Lleva tu equipo al punto acordado." : "Nuestro equipo coordinará contigo la recogida o la visita."}
          />
        </AccordionRow>
        <AccordionRow
          icon={<IconTool width={18} height={18} />}
          label="Diagnóstico"
          value={f.diagnosisAt ? "Completado" : f.status === "diagnosing" ? "En curso" : "Pendiente"}
          tone={f.diagnosisAt ? "ok" : f.status === "diagnosing" ? "wait" : "neutral"}
        >
          <Detail
            what={f.diagnosisAt ? "El técnico terminó la revisión de tu equipo." : f.status === "diagnosing" ? "Un técnico está revisando tu equipo." : "La revisión empieza cuando recibamos tu equipo."}
            at={when(f.diagnosisAt)}
            todo={f.diagnosisAt ? "Puedes leer el informe cuando quieras." : null}
            link={f.diagnosisDocId ? { href: `/c/documentos/${f.diagnosisDocId}`, label: "Ver diagnóstico" } : null}
          />
        </AccordionRow>
        <AccordionRow
          icon={<IconDoc width={18} height={18} />}
          label="Cotización"
          value={quoteValue}
          tone={f.quoteStatus === "approved" ? "ok" : f.quoteStatus === "rejected" ? "bad" : f.quoteStatus === "sent" || f.quoteStatus === "clarification" ? "wait" : "neutral"}
        >
          <Detail
            what={f.quoteStatus === "sent" ? "Tienes una propuesta lista para revisar." : f.quoteStatus === "approved" ? "Aprobaste la cotización." : f.quoteStatus === "rejected" ? "Rechazaste la cotización." : f.quoteStatus === "clarification" ? "Enviaste una pregunta; te respondemos en la cotización." : "La cotización llega después del diagnóstico."}
            todo={f.quoteStatus === "sent" ? "Revísala y decide: aprobar, preguntar o rechazar." : f.quoteStatus === "approved" && f.balanceDue > 0 && f.status === "awaiting_approval" ? "Elige cómo pagar para que podamos comenzar." : null}
            link={f.quoteStatus ? { href: `${base}/cotizacion`, label: "Ver cotización" } : null}
          />
        </AccordionRow>
        <AccordionRow
          icon={<IconGear width={18} height={18} />}
          label="Reparación"
          value={["ready", "delivered"].includes(f.status) ? "Finalizada" : IN_REPAIR.includes(f.status) ? (f.status === "awaiting_part" ? "Esperando repuesto" : "En curso") : "Pendiente"}
          tone={["ready", "delivered"].includes(f.status) ? "ok" : IN_REPAIR.includes(f.status) ? "wait" : "neutral"}
        >
          <Detail
            what={["ready", "delivered"].includes(f.status) ? "Terminamos el trabajo y las pruebas." : f.status === "awaiting_part" ? "Esperamos un repuesto para continuar." : IN_REPAIR.includes(f.status) ? "Estamos trabajando en tu equipo." : "La reparación empieza cuando apruebes la cotización y se confirme el pago."}
            at={when(f.repairDoneAt)}
          />
        </AccordionRow>
        <AccordionRow icon={<IconPackage width={18} height={18} />} label="Entrega" value={f.deliveredAt ? "Completada" : f.status === "ready" ? "Lista para coordinar" : "Pendiente"} tone={f.deliveredAt ? "ok" : f.status === "ready" ? "wait" : "neutral"}>
          <Detail
            what={f.deliveredAt ? "Entregamos tu equipo. Tus documentos y tu garantía quedan disponibles." : f.status === "ready" ? "Tu equipo está listo." : "La entrega se coordina cuando el equipo esté listo."}
            at={when(f.deliveredAt)}
            todo={f.status === "ready" ? (f.balanceDue > 0 ? `Paga el saldo restante (${money(f.balanceDue)}) para coordinar la entrega.` : "Coordina la entrega con nosotros.") : null}
          />
        </AccordionRow>
      </ul>
    </section>
  );
}

/** «Resumen del servicio»: plegado por defecto. */
export function ServiceSummary({ code, requestAt, modality, statusText, deliveredAt, balanceDue, warrantyUntil, diagnosisDocId, quoteDocId }: { code: string; requestAt: string; modality: string; statusText: string; deliveredAt: string | null; balanceDue: number; warrantyUntil: string | null; diagnosisDocId: string | null; quoteDocId: string | null }) {
  const rows: [string, string][] = [
    ["Servicio n.º", code],
    ["Fecha de solicitud", fmtDateTime(requestAt)],
    ["Modalidad", MODALITY_LABEL[modality] ?? modality],
    ["Estado", statusText],
    ["Saldo por pagar", balanceDue > 0 ? money(balanceDue) : "Sin saldo pendiente"],
    ...(deliveredAt ? ([["Entregado", fmtDateTime(deliveredAt)]] as [string, string][]) : []),
    ["Garantía", warrantyUntil ? `Activa hasta el ${new Date(`${warrantyUntil}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}` : "Se activa con la entrega"],
  ];
  return (
    <Accordion title="Resumen del servicio" icon={<IconShieldCheck width={18} height={18} />} meta={`${code} · ${MODALITY_LABEL[modality] ?? modality}`}>
      <dl className="m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-[14px] sm:grid-cols-[minmax(160px,auto)_minmax(0,1fr)]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-muted">{k}</dt>
            <dd className="m-0 text-right font-bold text-ink sm:text-left">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[14px] font-extrabold">
        {diagnosisDocId ? <Link href={`/c/documentos/${diagnosisDocId}`} className="flex min-h-11 items-center underline decoration-brand underline-offset-[3px]">Informe de diagnóstico</Link> : null}
        {quoteDocId ? <Link href={`/c/documentos/${quoteDocId}`} className="flex min-h-11 items-center underline decoration-brand underline-offset-[3px]">Cotización (PDF)</Link> : null}
        <Link href="/c/documentos" className="flex min-h-11 items-center underline decoration-brand underline-offset-[3px]">Todos mis documentos</Link>
      </div>
    </Accordion>
  );
}

/** Siguiente etapa esperada (solo informativa, gris) según el estado real actual. */
const NEXT: Record<string, string> = {
  received: "Diagnóstico",
  diagnosing: "Cotización",
  awaiting_approval: "Reparación",
  awaiting_part: "Reparación",
  in_service: "Pruebas",
  testing: "Listo para entregar",
  ready: "Entrega",
};

type HistoryItem = { id: number | string; to_status: string; reason: string | null; created_at: string };
type Tone = "done" | "current" | "pending" | "bad";
const TONE: Record<Tone, { dot: string; label: string; icon: React.ReactNode }> = {
  done: { dot: "border-ok bg-ok text-white", label: "Completado", icon: <IconCheck width={12} height={12} strokeWidth={3.5} /> },
  current: { dot: "border-brand bg-brand text-ink", label: "Etapa actual", icon: <IconClock width={12} height={12} strokeWidth={3} /> },
  pending: { dot: "border-line-strong bg-white text-muted", label: "Siguiente", icon: null },
  bad: { dot: "border-danger bg-danger text-white", label: "Requiere atención", icon: <IconAlert width={12} height={12} strokeWidth={3} /> },
};

/**
 * Historial con estados reales: verde = evento ya superado; naranja = estado vigente del servicio; rojo = cancelado; gris = la siguiente
 * etapa esperada (aún no ocurrió). Un evento solo se marca «completado» si el servicio ya pasó a otro estado posterior registrado.
 */
export function ServiceHistory({ items, status }: { items: HistoryItem[]; status: string }) {
  const latestFirst = [...items].reverse();
  const closed = status === "delivered" || status === "cancelled";
  const rows: { key: string; title: string; at: string | null; detail: string | null; tone: Tone }[] = [];
  if (!closed && NEXT[status]) rows.push({ key: "next", title: NEXT[status], at: null, detail: "Aún no ocurre.", tone: "pending" });
  latestFirst.forEach((h, i) => {
    const tone: Tone = h.to_status === "cancelled" ? "bad" : i === 0 && !closed ? "current" : "done";
    rows.push({ key: String(h.id), title: statusLabel(h.to_status), at: h.created_at, detail: h.reason, tone });
  });
  if (!rows.length) return <p className="m-0 text-[14px] text-muted">Todavía no hay movimientos.</p>;
  return (
    <ol className="m-0 flex list-none flex-col p-0" aria-label="Historial del servicio">
      {rows.map((r, i) => {
        const t = TONE[r.tone];
        return (
          <li key={r.key} className="relative flex gap-3 pb-4 last:pb-0">
            {i < rows.length - 1 ? <span aria-hidden className="absolute left-[9px] top-5 h-[calc(100%-12px)] w-0.5 bg-line-strong" /> : null}
            <span aria-hidden className={`relative z-10 mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${t.dot}`}>{t.icon}</span>
            <div className="flex min-w-0 flex-col">
              <span className={`text-[15px] ${r.tone === "pending" ? "font-semibold text-muted" : "font-extrabold text-ink"}`}>
                {r.title} <span className={`ml-1 text-[11.5px] font-extrabold uppercase tracking-[0.04em] ${r.tone === "done" ? "text-ok" : r.tone === "current" ? "text-warn" : r.tone === "bad" ? "text-danger" : "text-muted"}`}>· {t.label}</span>
              </span>
              {r.at ? <span className="text-[13px] font-semibold text-muted">{fmtDateTime(r.at)}</span> : null}
              {r.detail ? <span className="mt-0.5 text-[13px] text-ink-2">{r.detail}</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
