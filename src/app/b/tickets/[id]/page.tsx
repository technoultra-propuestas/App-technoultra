import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, EQUIPMENT_LABEL, fmtDateTime, MODALITY_LABEL, PageTitle, StatusBadge, statusLabel } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AssignForm, NoteForm, TransitionForm } from "./forms";
import { AiDiagnosisCard } from "@/components/ai/AiDiagnosisCard";
import { reviewAiAction } from "../ai-actions";
import { DiagnosisBox } from "./diagnosis-box";
import { QuoteSection } from "./quote-section";
import { ReceptionSection } from "./reception-section";
import { WorkSection } from "./work-section";
import { DocumentsSection } from "./documents-section";

export const metadata: Metadata = { title: "Ticket", robots: { index: false } };

export default async function StaffTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole(["technician", "superadmin"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  // RLS: un técnico no asignado recibe 0 filas → 404.
  const { data: t } = await supabase
    .from("tickets")
    .select("id, code, status, modality, problem, assigned_to, received_at, cancelled_reason, customers(full_name, phone, email), equipment(type, brand, model, serial), services(name)")
    .eq("id", id.data)
    .maybeSingle();
  if (!t) notFound();

  const [{ data: history }, { data: notes }, { data: transitions }, staffRes] = await Promise.all([
    supabase.from("ticket_status_history").select("id, to_status, reason, created_at").eq("ticket_id", t.id).order("created_at"),
    supabase.from("ticket_notes").select("id, body, visibility, kind, created_at").eq("ticket_id", t.id).order("created_at", { ascending: false }),
    supabase.from("ticket_transitions").select("to_status, allowed_roles, requires_reason").eq("from_status", t.status),
    me.role === "superadmin"
      ? supabase.from("profiles").select("id, full_name, email").in("role", ["technician", "superadmin"]).eq("is_active", true).order("full_name")
      : Promise.resolve({ data: [] as { id: string; full_name: string; email: string }[] }),
  ]);

  const { data: ai } = await supabase
    .from("ai_diagnostics")
    .select("id, output, urgency, disclaimer, validation_status, model")
    .eq("ticket_id", t.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const options = (transitions ?? [])
    .filter((x) => (x.allowed_roles as string[]).includes(me.role))
    .map((x) => ({ to: x.to_status as string, label: statusLabel(x.to_status), requiresReason: x.requires_reason as boolean }));
  const customer = t.customers as unknown as { full_name: string; phone: string | null; email: string | null } | null;
  const eq = t.equipment as unknown as { type: string; brand: string; model: string; serial: string | null } | null;
  const svc = t.services as unknown as { name: string } | null;

  return (
    <section className="grid gap-6 md:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-6">
        <PageTitle title={t.code} subtitle={`${svc?.name ?? "Servicio"} · ${MODALITY_LABEL[t.modality]}`} />
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <StatusBadge status={t.status} />
            <span className="text-[13px] font-semibold text-muted">Recibido {fmtDateTime(t.received_at)}</span>
          </div>
          <p className="m-0 text-[15px] leading-normal">{t.problem}</p>
          {t.cancelled_reason ? <p className="m-0 text-[14px] text-muted">Motivo de cancelación: {t.cancelled_reason}</p> : null}
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-1">
            <h2 className="m-0 text-[15px] font-extrabold">Cliente</h2>
            <span className="text-[15px] font-semibold">{customer?.full_name}</span>
            {customer?.phone ? <a href={`tel:${customer.phone}`} className="text-[14px] font-semibold underline decoration-brand underline-offset-[3px]">{customer.phone}</a> : null}
            {customer?.email ? <span className="text-[13px] text-muted">{customer.email}</span> : null}
          </Card>
          <Card className="flex flex-col gap-1">
            <h2 className="m-0 text-[15px] font-extrabold">Equipo</h2>
            {eq ? (
              <>
                <span className="text-[15px] font-semibold">
                  {eq.brand} {eq.model}
                </span>
                <span className="text-[13px] text-muted">
                  {EQUIPMENT_LABEL[eq.type] ?? eq.type}
                  {eq.serial ? ` · Serial ${eq.serial}` : ""}
                </span>
              </>
            ) : (
              <span className="text-[14px] text-muted">Sin equipo (servicio remoto o digital)</span>
            )}
          </Card>
        </div>
        {ai ? (
          <AiDiagnosisCard row={ai} audience="staff">
            {ai.validation_status === "pending" ? (
              <div className="flex flex-wrap gap-2">
                {([["validated", "Validar"], ["edited", "Marcar como ajustado"], ["rejected", "Descartar"]] as const).map(([st, label]) => (
                  <form key={st} action={reviewAiAction}>
                    <input type="hidden" name="ticketId" value={t.id} />
                    <input type="hidden" name="id" value={ai.id} />
                    <input type="hidden" name="status" value={st} />
                    <button type="submit" className="min-h-11 rounded-[14px] border border-line-strong bg-white px-4 text-[14px] font-extrabold">{label}</button>
                  </form>
                ))}
              </div>
            ) : null}
          </AiDiagnosisCard>
        ) : null}
        <ReceptionSection ticketId={t.id} problem={t.problem} open={!["delivered", "cancelled"].includes(t.status) && ["received", "diagnosing"].includes(t.status)} />
        <WorkSection ticketId={t.id} status={t.status} />
        <DiagnosisBox ticketId={t.id} isAdmin={me.role === "superadmin"} />
        <QuoteSection ticketId={t.id} canQuote ticketOpen={!(["delivered", "cancelled"] as string[]).includes(t.status)} />
        <DocumentsSection ticketId={t.id} status={t.status} />
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Historial</h2>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {(history ?? []).map((h) => (
              <li key={h.id} className="flex flex-col gap-0.5 text-[15px] font-semibold">
                <div className="flex justify-between gap-3">
                  <span>{statusLabel(h.to_status)}</span>
                  <span className="text-[13px] text-muted">{fmtDateTime(h.created_at)}</span>
                </div>
                {h.reason ? <span className="text-[13px] font-normal text-muted">{h.reason}</span> : null}
              </li>
            ))}
          </ol>
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Notas</h2>
          {(notes ?? []).length === 0 ? <p className="m-0 text-[14px] text-muted">Sin notas todavía.</p> : null}
          {(notes ?? []).map((n) => (
            <p key={n.id} className="m-0 text-[15px] leading-normal">
              {n.body}{" "}
              <span className="text-[12px] text-muted">
                · {n.visibility === "customer" ? "visible al cliente" : "interna"} · {fmtDateTime(n.created_at)}
              </span>
            </p>
          ))}
        </Card>
      </div>
      <aside className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Cambiar estado</h2>
          <TransitionForm ticketId={t.id} options={options} />
        </Card>
        {me.role === "superadmin" ? (
          <Card>
            <AssignForm ticketId={t.id} current={t.assigned_to} staff={(staffRes.data ?? []).map((s) => ({ id: s.id, name: s.full_name || s.email }))} />
          </Card>
        ) : null}
        <Card>
          <NoteForm ticketId={t.id} />
        </Card>
      </aside>
    </section>
  );
}
