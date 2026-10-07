import type { Metadata } from "next";
import { SubmitButton } from "@/components/ui/form";
import { Card, LinkButton, money } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { paidNextStep } from "@/lib/domain/ticket-flow";
import { derivePaymentUi, PAYMENT_LABEL, PAYMENT_MESSAGE, type DbPaymentStatus } from "@/lib/payments/state";
import { createClient } from "@/lib/supabase/server";
import { startServicePaymentAction } from "../../tickets/pay-actions";

export const metadata: Metadata = { title: "Solicitud recibida", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-[15px] font-bold">
      <span aria-hidden className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[13px] font-extrabold ${done ? "bg-ok-soft text-ok" : "bg-[#EDEDEA] text-muted"}`}>
        {done ? "✓" : "•"}
      </span>
      {children}
    </li>
  );
}

/**
 * «Solicitud recibida»: dice qué ocurrió, qué sigue y cuánto cuesta. Todo se lee de la base de datos bajo RLS (el cliente solo ve lo
 * suyo); el importe y el flujo (pago inmediato o cotización) los decide el servidor, nunca este componente.
 */
export default async function RequestDonePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["client"]);
  const sp = await searchParams;
  const code = (sp.c ?? "").slice(0, 20).replace(/[^A-Z0-9-]/gi, "");
  const ticketId = UUID.test(sp.t ?? "") ? (sp.t as string) : null;
  const supabase = await createClient();

  const { data: t } = ticketId
    ? await supabase.from("tickets").select("id, code, status, modality, service_id, service_snapshot, prepaid_at, services(name, is_diagnostic_fee, allow_online_payment, kind, base_price)").eq("id", ticketId).maybeSingle()
    : { data: null };
  const svc = one(t?.services as Rel<{ name: string; is_diagnostic_fee: boolean; allow_online_payment: boolean; kind: string; base_price: number | null }>);
  const { data: flow } = t && t.service_id ? await supabase.rpc("service_flow", { p_service: t.service_id, p_modality: t.modality }) : { data: null };
  const { data: credit } = t && svc?.is_diagnostic_fee ? await supabase.from("diagnosis_credits").select("id").eq("ticket_id", t.id).maybeSingle() : { data: null };

  const price = Number((t?.service_snapshot as { base_price?: number } | null)?.base_price ?? svc?.base_price ?? 0);
  const kind = svc?.is_diagnostic_fee ? "diagnosis" : "service";
  const paid = Boolean(t?.prepaid_at || credit);
  // El estado del pago sale del servidor (filas de payments): si ya hay un pago iniciado o confirmado NO se vuelve a ofrecer «Pagar».
  const { data: pays } = t ? await supabase.from("payments").select("status, provider, created_at").eq("ticket_id", t.id).eq("purpose", kind) : { data: [] };
  const payUi = derivePaymentUi((pays ?? []).map((p) => ({ status: p.status as DbPaymentStatus, provider: p.provider, created_at: p.created_at })), paid);
  const payNow = Boolean(t && svc && flow === "immediate" && payUi.canPay && svc.allow_online_payment && price > 0 && !["cancelled", "delivered"].includes(t.status));

  return (
    <section className="mx-auto flex w-full max-w-[560px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">Solicitud recibida</h1>
        <p className="m-0 text-[15px] leading-normal text-muted">Ya quedó registrada. No hacemos ningún trabajo sin tu aprobación.</p>
      </div>

      <Card className="flex flex-col gap-3">
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          <Step done>Solicitud registrada {code ? <span className="font-semibold text-muted">· {code}</span> : null}</Step>
          <Step done={Boolean(t)}>
            {t ? (
              <>
                Ticket creado <span className="font-semibold text-muted">· {t.code}</span>
              </>
            ) : (
              "Nuestro equipo creará tu ticket enseguida"
            )}
          </Step>
          {t && flow === "immediate" ? <Step done={payUi.state === "confirmed"}>{payUi.state === "none" ? "Pago pendiente" : PAYMENT_LABEL[payUi.state]}</Step> : null}
        </ul>
      </Card>

      {payNow && t && svc ? (
        <Card className="flex flex-col gap-3 border-brand">
          <div>
            <div className="text-[13px] font-bold text-muted">Siguiente paso</div>
            <div className="text-[19px] font-extrabold">Pagar {svc.is_diagnostic_fee ? "el diagnóstico" : "el servicio"}</div>
            <p className="m-0 mt-1 text-[14px] leading-snug text-muted">
              {svc.name} · {money(price)}. {svc.is_diagnostic_fee ? "Si apruebas la reparación, este valor se abona a su costo." : "Puedes pagar ahora para iniciar el proceso."}
            </p>
          </div>
          <form action={startServicePaymentAction} className="flex flex-col gap-2">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="ticketId" value={t.id} />
            <input type="hidden" name="ref" value={t.id} />
            <SubmitButton pendingText="Abriendo el pago…">{payUi.state === "none" ? `Pagar ${money(price)}` : `Pagar de nuevo ${money(price)}`}</SubmitButton>
          </form>
          {payUi.state !== "none" ? <p className="m-0 text-[13px] font-semibold text-danger">{PAYMENT_MESSAGE[payUi.state]}</p> : null}
          <p className="m-0 text-[12px] text-muted">También puedes pagar en el local; el equipo lo registrará.</p>
        </Card>
      ) : null}

      {t && flow === "immediate" && payUi.state === "validating" ? (
        <Card className="border-brand">
          <div className="text-[17px] font-extrabold text-warn">{PAYMENT_LABEL.validating}</div>
          <p className="m-0 mt-1 text-[14px] text-muted">{PAYMENT_MESSAGE.validating}</p>
        </Card>
      ) : null}

      {t && flow === "immediate" && payUi.state === "confirmed" ? (
        <Card className="border-ok">
          <div className="text-[17px] font-extrabold text-ok">✓ {PAYMENT_LABEL.confirmed}</div>
          <p className="m-0 mt-1 text-[14px] leading-snug text-muted">{paidNextStep(t.modality)}</p>
        </Card>
      ) : null}

      {t && flow === "immediate" && !paid && !payNow && payUi.state === "none" ? (
        <Card>
          <div className="text-[17px] font-extrabold">Siguiente paso</div>
          <p className="m-0 mt-1 text-[14px] text-muted">Este servicio se paga en el local; el equipo registrará tu pago.</p>
        </Card>
      ) : null}

      {t && flow !== "immediate" ? (
        <Card>
          <div className="text-[17px] font-extrabold">Siguiente paso</div>
          <p className="m-0 mt-1 text-[14px] leading-snug text-muted">
            {svc?.kind === "digital" ? "Nuestro equipo te contactará para definir el alcance." : "Este servicio requiere una revisión antes de conocer el precio final. Te enviaremos la cotización para que la apruebes; no pagas nada antes."}
          </p>
        </Card>
      ) : null}

      <LinkButton href={t ? `/c/tickets/${t.id}` : "/c/tickets"} variant={payNow ? "ghost" : "primary"}>
        {t ? "Ver mi ticket" : "Ver mis solicitudes"}
      </LinkButton>
    </section>
  );
}
